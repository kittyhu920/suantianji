// 翻页（docs/DESIGN.md §19）：一张纸从书脊翻过去。
//
// 不依赖框架，Ritual（仪式页）与目录页共用。用 CSS 3D：翻动的这一张（leaf）从书脊（左边）起转，
// 沿横向切成 STRIPS 条窄纸，每条相对上一条再弯一点，翻动时纸就有了弯曲感；
// 每一帧只改几个 CSS 变量（--rot、--bend、--shf、--shb），内容是事先克隆好的快照，不重排。
// 正面（front）是翻起时看到的那一页，背面（back）是翻过去之后落在左边的那一页。
//   dir = 1  向后翻：右页翻过去，背面是下一屏的左页
//   dir = -1 向前翻：从左页翻回右边（时间倒放）
// 手机（单页）：只有一页，纸绕左缘转开约 100°，不显示背面。

export const STRIPS = 4;
const TAU = Math.PI * 2;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

/** 克隆一块 DOM 作快照：去掉非 SVG 元素的 id，补回画布内容与输入框的值，标上 is-snap（样式里关掉动画） */
export function snapshot(node) {
  const copy = node.cloneNode(true);
  const src = [...node.querySelectorAll('canvas')];
  [...copy.querySelectorAll('canvas')].forEach((c, i) => {
    try { c.getContext('2d')?.drawImage(src[i], 0, 0); } catch { /* 画布不可读就空着 */ }
  });
  const inputs = [...node.querySelectorAll('input, textarea')];
  [...copy.querySelectorAll('input, textarea')].forEach((c, i) => { c.value = inputs[i]?.value ?? ''; });
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

function strips(n, w, h, frontNode, backNode, single) {
  const s = w / n;
  const make = (i) => {
    const el = document.createElement('div');
    el.className = 'lf-strip';
    el.style.width = `${s + (i < n - 1 ? 1 : 0)}px`; // 与下一条重叠 1px，免得缝里透出底下的页
    el.style.setProperty('--k', (0.75 + 0.5 * (i / Math.max(1, n - 1))).toFixed(2));
    const f = document.createElement('div');
    f.className = 'lf-face lf-front';
    const fi = document.createElement('div');
    fi.className = 'lf-inner';
    fi.style.cssText = `width:${w}px;height:${h}px;margin-left:${-i * s}px`;
    if (frontNode) fi.append(i === 0 ? frontNode : snapshot(frontNode));
    const fs = document.createElement('i');
    fs.className = 'lf-shade';
    f.append(fi, fs);
    el.append(f);
    if (!single) {
      const b = document.createElement('div');
      b.className = 'lf-face lf-back';
      const bi = document.createElement('div');
      bi.className = 'lf-inner';
      bi.style.cssText = `width:${w}px;height:${h}px;margin-left:${-(w - (i + 1) * s)}px`;
      if (backNode) bi.append(i === 0 ? backNode : snapshot(backNode));
      const bs = document.createElement('i');
      bs.className = 'lf-shade';
      b.append(bi, bs);
      el.append(b);
    }
    return el;
  };
  const root = make(0);
  let parent = root;
  for (let i = 1; i < n; i++) {
    const el = make(i);
    el.classList.add('lf-next');
    parent.append(el);
    parent = el;
  }
  return root;
}

/**
 * 造一张翻动的纸，放进书里；返回手柄。
 * @param {HTMLElement} shell  书（有 perspective 的那个容器），翻动的纸与投影都放进它
 * @param {object} o
 *   front, back   两面的内容（已克隆好的 DOM 节点）
 *   page          { w, h } 一页的像素尺寸
 *   dir           1 向后翻 / -1 向前翻（只决定纸从哪边起）
 *   single        手机单页
 * @returns {{ set(e), remove(), max }}  set(e)：e 为 0（平放在右边）到 1（翻到左边），拖页角时由手直接给；
 */
export function createLeaf(shell, { front, back, page, single = false }) {
  const { w, h } = page;
  const maxRot = single ? 104 : 180;
  const K = single ? 4 : 6.5; // 每条相对上一条多弯的最大角度
  const box = document.createElement('div');
  box.className = 'leafbox' + (single ? ' is-single' : '');
  const cast = document.createElement('i');
  cast.className = 'lf-cast';
  const leaf = document.createElement('div');
  leaf.className = 'leaf';
  leaf.style.width = `${w}px`;
  leaf.style.height = `${h}px`;
  leaf.append(strips(single ? 3 : STRIPS, w, h, front, back, single));
  box.append(cast, leaf);
  shell.append(box);

  const set = (e) => {
    const rot = -maxRot * e;
    const bend = -K * Math.sin(TAU * e) * (single ? 0.6 : 1);
    box.style.setProperty('--rot', `${rot}deg`);
    box.style.setProperty('--bend', `${bend}deg`);
    const s = Math.sin(Math.PI * e);
    box.style.setProperty('--shf', (e < 0.5 ? s * 0.5 : 0).toFixed(3));
    box.style.setProperty('--shb', (e >= 0.5 ? s * 0.5 : 0).toFixed(3));
    // 纸落在页面上的影：翻起的纸投影到书脊两侧
    const c = Math.cos((Math.PI * e * maxRot) / 180);
    const edge = w * c; // 纸的自由边在书脊右侧的投影位置（负数在左）
    const cw = Math.abs(edge);
    cast.style.width = `${cw}px`;
    cast.style.left = `${edge >= 0 ? 0 : edge}px`;
    cast.style.opacity = (Math.sin(Math.PI * e) * 0.9).toFixed(3);
    cast.dataset.side = edge >= 0 ? 'r' : 'l';
  };
  set(0);
  return { set, remove: () => box.remove(), box, maxRot };
}

/** 从 from 到 to 慢慢翻（ease 过的）；返回 { done, finish }。finish() 立刻落到终点 */
export function animateLeaf(leaf, from, to, ms, { onFrame, keep = false, easing = ease } = {}) {
  let raf = 0;
  let ended = false;
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const end = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    leaf.set(to);
    if (!keep) leaf.remove(); // keep：翻完不拆（跳转页面之前，纸留在原处）
    resolve();
  };
  const t0 = performance.now();
  leaf.set(from);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / Math.max(1, ms));
    leaf.set(from + (to - from) * easing(t));
    onFrame?.(now);
    if (t >= 1) { end(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { done, finish: end };
}

/**
 * 播一次翻页（整张纸一口气翻完）。dir 1 向后翻（0→1）/ -1 向前翻（1→0）。
 *   ms 时长；onFrame(t) 每帧回调（取帧率用）；keep 翻完不拆
 * @returns {{ done: Promise<void>, finish: () => void }}
 */
export function playLeaf(shell, { front, back, page, dir = 1, single = false, ms = 1100, onFrame, keep = false }) {
  ms *= globalThis.__flipSlow || 1; // 调试：把翻页放慢，便于截取翻到一半的样子
  const leaf = createLeaf(shell, { front, back, page, single });
  return animateLeaf(leaf, dir > 0 ? 0 : 1, dir > 0 ? 1 : 0, ms, { onFrame, keep });
}
