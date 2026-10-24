// 翻页（docs/DESIGN.md §19、§20）：一张纸从书脊翻过去，像真纸一样卷起来。
//
// 不依赖框架，Ritual（仪式页）与目录页共用。用 CSS 3D：翻动的这一张（leaf）从书脊（左边）起转，
// 沿横向切成 STRIPS 条窄纸，每条相对上一条再弯一点，弯曲随翻开的程度与翻动的快慢变化，纸就卷起来了；
// 内容是事先克隆好的快照，不重排。每一帧只直接写几个元素的 transform / opacity：
// **不用 CSS 变量**（变量写在祖先上，会让底下所有克隆出来的页都重算一遍样式）。
//
// 正面（front）是翻起时看到的那一页，背面（back）是翻过去之后落在左边的那一页。
//   dir = 1  向后翻：右页翻过去，背面是下一屏的左页
//   dir = -1 向前翻：从左页翻回右边（时间倒放）
// 背面的纸略透，隐约透出正面文字的反影；翻起的纸在底下那一页上投出移动的阴影。
// 动起来用弹簧（springTo）：拖页角时跟着手走，松手后带着手的速度过中线就翻过去、没过就弹回，落下时有一点回弹；点击翻页是同一套。
// 手机（单页）：只有一页，纸绕左缘转开约 104°，不显示背面。

export const STRIPS = 10;
export const STRIPS_SINGLE = 8;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 克隆一块 DOM 作快照：去掉非 SVG 元素的 id，补回画布内容与输入框的值，标上 is-snap（样式里关掉动画） */
export function snapshot(node) {
  const copy = node.cloneNode(true);
  fixLive(node, copy);
  const strip = (el) => {
    if (el.removeAttribute && !(el instanceof SVGElement) && !el.closest('svg')) {
      el.removeAttribute('id');
      el.removeAttribute('for');
      el.removeAttribute('name');
    }
    el.removeAttribute?.('autofocus');
    if (el.matches?.('a, button, input, textarea, [tabindex]')) el.tabIndex = -1;
  };
  strip(copy);
  copy.querySelectorAll('*').forEach(strip);
  copy.setAttribute('aria-hidden', 'true');
  copy.classList.add('is-snap');
  return copy;
}

// 克隆不带活的状态：把画布里的像素与输入框里的值补回去
function fixLive(src, copy) {
  const cs = src.querySelectorAll('canvas');
  if (cs.length) {
    const cc = copy.querySelectorAll('canvas');
    cc.forEach((c, i) => {
      try { c.getContext('2d')?.drawImage(cs[i], 0, 0); } catch { /* 画布不可读就空着 */ }
    });
  }
  const is = src.querySelectorAll('input, textarea');
  if (is.length) copy.querySelectorAll('input, textarea').forEach((c, i) => { c.value = is[i]?.value ?? ''; });
}

/** 再复制一份已经处理好的快照（比重新走一遍 snapshot 便宜：不用再逐个去 id） */
function dup(node) {
  const copy = node.cloneNode(true);
  fixLive(node, copy);
  return copy;
}

const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

/** 一面纸：内容 + 暗部 + 亮部 */
function face(cls, w, h, off, node, withHi) {
  const f = el('div', `lf-face ${cls}`);
  const inner = el('div', 'lf-inner');
  inner.style.cssText = `width:${w}px;height:${h}px;margin-left:${off}px`;
  if (node) inner.append(node);
  const sh = el('i', 'lf-shade');
  const hi = withHi ? el('i', 'lf-hi') : null; // 亮部只有正面有（背面翻过来时朝着里面，没有高光）
  f.append(inner, sh);
  if (hi) f.append(hi);
  return { f, sh, hi, inner };
}

function buildStrips(n, w, h, frontNode, backNode, single) {
  const s = w / n;
  const list = [];
  let root = null;
  let parent = null;
  for (let i = 0; i < n; i++) {
    const strip = el('div', 'lf-strip' + (i ? ' lf-next' : '') + (i === n - 1 ? ' lf-last' : ''));
    strip.style.width = `${s + (i < n - 1 ? 1 : 0)}px`; // 与下一条重叠 1px，免得缝里透出底下的页
    const fr = face('lf-front', w, h, -i * s, frontNode ? (i === 0 ? frontNode : dup(frontNode)) : null, true);
    strip.append(fr.f);
    let bk = null;
    if (!single) {
      // 背面的内容晚一点再放（见 createLeaf）：纸刚翻起时背面还朝着里面，先造正面，免得第一帧要克隆二十份页
      bk = face('lf-back', w, h, -(w - (i + 1) * s), backNode && i === 0 ? backNode : null, false);
      strip.append(bk.f);
    }
    list.push({ el: strip, fr, bk, x: '', sf: '', hf: '', sb: '', hb: '' });
    if (parent) parent.append(strip); else root = strip;
    parent = strip;
  }
  return { root, list, s };
}

// 把 CSS 值写进元素，没变就不写（少触发样式失效）
const put = (node, prop, val, cache, key) => {
  if (cache[key] === val) return;
  cache[key] = val;
  node.style[prop] = val;
};

/**
 * 造一张翻动的纸，放进书里；返回手柄。
 * @param {HTMLElement} shell  书（翻动的纸与投影都放进它）
 * @param {object} o
 *   front, back   两面的内容（已克隆好的 DOM 节点）
 *   page          { w, h } 一页的像素尺寸（布局尺寸，不是屏幕上量出来的）
 *   single        手机单页
 * @returns {{ set(e, lag), remove(), box, maxRot }}
 *   set(e, lag)：e 为 0（平放在右边）到 1（翻到左边）；lag 是动起来时纸边落在后面的度数（动态的卷曲，由 springTo 与拖动给）
 */
export function createLeaf(shell, { front, back, page, single = false }) {
  const { w, h } = page;
  const n = single ? STRIPS_SINGLE : STRIPS;
  const maxRot = single ? 104 : 180;
  const KT = single ? 24 : 40; // 静态的卷曲：整张纸从书脊到纸边一共弯多少度（e = 0.25 时最大）
  const box = el('div', 'leafbox' + (single ? ' is-single' : ''));
  const castR = el('i', 'lf-cast lf-cast-r');
  const castL = el('i', 'lf-cast lf-cast-l');
  castR.style.cssText = `width:${w}px`;
  castL.style.cssText = `width:${w}px;left:${-w}px`;
  const leaf = el('div', 'leaf');
  leaf.style.width = `${w}px`;
  leaf.style.height = `${h}px`;
  const { root, list, s } = buildStrips(n, w, h, front, back, single);
  leaf.append(root);
  box.append(castR, castL, leaf);
  shell.append(box);

  // 背面的内容分几帧补上，从纸边那一条补起（它最先翻过去）；每帧两条，不让一帧里的活太多
  let raf = 0;
  if (back && !single) {
    let k = n - 1;
    const fill = () => {
      raf = 0;
      for (let c = 0; c < 2 && k >= 1; c++, k--) list[k].bk.inner.append(dup(back));
      if (k >= 1) raf = requestAnimationFrame(fill);
    };
    raf = requestAnimationFrame(fill);
  }

  // 每条纸弯的权重：越靠纸边弯得越多（页角被拎起来的样子），总和为 1
  const wt = [];
  let wsum = 0;
  for (let i = 1; i < n; i++) { const v = 0.55 + i / (n - 1); wt[i] = v; wsum += v; }
  for (let i = 1; i < n; i++) wt[i] /= wsum;

  const cache = {};

  const set = (e, lag = 0) => {
    e = clamp(e, 0, 1);
    const th0 = maxRot * e;
    const bend = KT * Math.sin(TAU * e) + lag; // θ 空间里整张纸的弯曲：正 = 纸边领先（翻起时），负 = 纸边落后
    put(leaf, 'transform', `rotateY(${(-th0).toFixed(2)}deg)`, cache, 'leaf');
    const env = Math.min(1, Math.min(e, 1 - e) * 10); // 刚离开、刚落下时光影从无到有，免得跳一下
    let th = th0;
    let x = 0;
    let minX = 0; let maxX = 0;
    for (let i = 0; i < n; i++) {
      if (i) {
        const b = bend * wt[i];
        th += b;
        put(list[i].el, 'transform', `rotateY(${(-b).toFixed(2)}deg)`, list[i], 'x');
      }
      x += s * Math.cos(th * RAD);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      // 光：正面朝着灯时亮，侧立时暗；背面同理（从左页的平面量起）
      const a = Math.abs(th);
      const front = a < 90;
      const sin = Math.abs(Math.sin(a * RAD));
      const dark = (0.04 + 0.36 * sin ** 1.6) * env;
      const hi = 0.2 * Math.max(0, Math.sin(2 * a * RAD)) * env;
      const L = list[i];
      put(L.fr.sh, 'opacity', front ? dark.toFixed(3) : '0', L, 'sf');
      put(L.fr.hi, 'opacity', front ? hi.toFixed(3) : '0', L, 'hf');
      if (L.bk) {
        const sb = 0.04 + 0.36 * Math.abs(Math.sin((180 - a) * RAD)) ** 1.6;
        put(L.bk.sh, 'opacity', !front ? (sb * env).toFixed(3) : '0', L, 'sb');
      }
    }
    // 纸落在页面上的影：翻起的纸投影到书脊两侧，离书脊越远越淡
    const op = clamp(0.95 * Math.sin(Math.PI * e) ** 0.7, 0, 1);
    const kr = maxX > 1 ? clamp(maxX / (0.8 * w), 0, 1.25) : 0; // 影比纸多出一截（光从侧上方来），纸边在影的八成处
    const kl = minX < -1 ? clamp(-minX / (0.8 * w), 0, 1.25) : 0;
    put(castR, 'transform', `scaleX(${kr.toFixed(3)})`, cache, 'cr');
    put(castR, 'opacity', kr ? op.toFixed(3) : '0', cache, 'or');
    put(castL, 'transform', `scaleX(${kl.toFixed(3)})`, cache, 'cl');
    put(castL, 'opacity', kl ? op.toFixed(3) : '0', cache, 'ol');
  };
  set(0);
  return { set, remove: () => { cancelAnimationFrame(raf); box.remove(); }, box, maxRot, single };
}

/**
 * 用弹簧把纸从 from 带到 to（p 是“翻过去的程度”：0 在原处，1 翻到对面；向前翻时 e = 1 - p）。
 * 带着初速度 v0（每秒 p 的变化）；动得快时纸边落在后面（lag），停下来时随速度反向而晃一下；
 * 碰到端点（p 到 0 或 1）要回弹一小下。返回 { done, finish }；finish() 立刻落到终点。
 */
export function springTo(leaf, { from, to, v0 = 0, omega = 8, zeta = 0.8, dir = 1, maxMs = 1800, onFrame, keep = false } = {}) {
  const slow = globalThis.__flipSlow || 1; // 调试：放慢，便于截取翻到一半的样子
  const w = omega / slow;
  const eOf = (p) => (dir > 0 ? p : 1 - p);
  const maxRot = leaf.maxRot ?? 180;
  let p = from; let v = v0 / slow;
  let lag = 0;
  let raf = 0; let ended = false; let resolve;
  const done = new Promise((r) => { resolve = r; });
  const t0 = performance.now();
  let prev = t0;
  const finish = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    leaf.set(eOf(to), 0);
    if (!keep) leaf.remove();
    resolve();
  };
  const frame = (now) => {
    const dt = Math.min(0.034, (now - prev) / 1000) || 0.016;
    prev = now;
    // 两个子步，积分更稳
    for (let k = 0; k < 2; k++) {
      const d = dt / 2;
      v += (-w * w * (p - to) - 2 * zeta * w * v) * d;
      p += v * d;
      if (p > 1) { p = 1; v = -Math.abs(v) * 0.28; } // 落到另一边：回弹一小下
      else if (p < 0) { p = 0; v = Math.abs(v) * 0.28; }
    }
    // 动态的卷曲：纸边跟不上纸身，落在后面（θ 空间里的度数）
    const dth = v * slow * maxRot * (dir > 0 ? 1 : -1); // 每秒转多少度（朝翻开的方向为正）
    const target = clamp(-dth * 0.05, -22, 22);
    lag += (target - lag) * Math.min(1, dt * 14);
    leaf.set(eOf(p), lag);
    onFrame?.(now);
    if ((Math.abs(p - to) < 0.002 && Math.abs(v) < 0.03) || now - t0 > maxMs * slow) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  leaf.set(eOf(from), 0);
  raf = requestAnimationFrame(frame);
  return { done, finish };
}

/**
 * 播一次翻页（整张纸一口气翻完，点击翻页用）。dir 1 向后翻（0→1）/ -1 向前翻（1→0）。
 *   ms 约定时长（越短弹簧越紧）；onFrame(t) 每帧回调（取帧率用）；keep 翻完不拆
 * @returns {{ done: Promise<void>, finish: () => void }}
 */
export function playLeaf(shell, { front, back, page, dir = 1, single = false, ms = 1100, onFrame, keep = false }) {
  const leaf = createLeaf(shell, { front, back, page, single });
  return springTo(leaf, { from: 0, to: 1, dir, omega: 7.4 * (1100 / ms), zeta: 0.72, onFrame, keep });
}
