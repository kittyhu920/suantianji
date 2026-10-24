// 书的话：大师（这本书）把话写在当前书页的空白处（排版与逐字洇开的规则见 docs/DESIGN.md §4、§19）。
// 一句话先整句排好版（每个字都已在 DOM 里，只是被动画延迟压着没出现），再一笔一笔洇开；
// 写完停一会儿，再慢慢渗进纸里、淡去。队列、去重（key）、翻页时暂缓、写快写慢的节奏，都沿用旧的眉批槽。
// 位置：先在两页里找一块放得下这句话的空白（避开正文、图、输入框和还没淡去的别的字迹）；找不到，就写在页边。
// 字用霞鹜文楷；数字与句尾的“〇”点朱（marks.js），警示句的着重点用朱。
// 减少动效：不逐字洇开，只淡入、淡出。

import { inkChar } from './inkchars.js';
import { numberIndexes } from './marks.js';
import { bookMap } from './book/geo.js';

const CLAUSE = /[^，。：；、！？]+[，。：；、！？]?|[，。：；、！？]/g;
const WIDTHS = [330, 270, 220];
const rand = (a, b) => a + Math.random() * (b - a);

/** 一页上已经有字、有图的地方（页面坐标，见 book/geo.js），向外多留一点 */
function occupied(body, map, pad = 16) {
  const out = [];
  if (!body) return out;
  const push = (r) => {
    if (r.width <= 1 || r.height <= 1) return;
    const q = map.rect(r);
    out.push({ l: q.l - pad, t: q.t - pad, r: q.r + pad, b: q.b + pad });
  };
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('.tou, .voice, [hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) push(r);
  }
  for (const el of body.querySelectorAll('svg, canvas, img, input, textarea, button, hr, .sign, .oracle, .loom, .omen-fig')) {
    if (el.closest('.tou, .voice, [hidden]')) continue;
    for (const r of el.getClientRects()) push(r);
  }
  return out;
}

const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function createGloss(host, { reduced = false, pages } = {}) {
  const queue = [];
  let busy = false;
  let cur = null; // 正在写的那一条
  let holding = null; // 翻页时暂缓：一个 Promise，落定后才继续写
  let live = true; // 在回看写下的页时，大师不开口
  let resume = null;

  // 等 ms 毫秒；被 wake() 叫醒就提前结束，并记下"被顶替了"
  const wait = (item, ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    item.wake = () => { item.woken = true; clearTimeout(t); resolve(); };
  });

  // key：同一类的话只留最新一条。连点"功名、尘缘"时，排队的旧话被剔掉，正在显示的马上让位给新的
  function push(text, { alarm = false, key = '' } = {}) {
    if (key) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1);
      if (cur?.key === key) cur.wake?.();
    }
    queue.push({ text, alarm, key });
    if (!busy) drain();
  }

  // 等当前页上有内容（最多约半秒）
  async function pageReady() {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const ps = pages?.() ?? [];
      if (!ps[0] || ps[0].body?.querySelector('.screen, article, section')) return;
    }
  }

  // 找一块空白放 el（el 已量好宽高）。返回 { x, y, edge }：host 内的坐标
  function spot(w, h) {
    const ps = pages?.() ?? [];
    const map = bookMap(host.closest('.huaxin') ?? host); // 书在缩放、倾斜过的场景里：先把量到的矩形都换成页面坐标
    const others = [...host.querySelectorAll('.gloss:not(.is-measure)')].map((n) => {
      const r = map.rect(n.getBoundingClientRect());
      return { l: r.l - 12, t: r.t - 12, r: r.r + 12, b: r.b + 12 };
    });
    const local = (el) => ({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, right: el.offsetLeft + el.offsetWidth, bottom: el.offsetTop + el.offsetHeight });
    const found = [];
    for (const pg of ps) {
      const pr = local(pg.page);
      if (!pr.width) continue;
      const bad = occupied(pg.body, map).concat(others);
      const m = 26; // 离纸边的距离
      for (let y = pr.top + m + 4; y + h <= pr.bottom - m - 6; y += 14) {
        for (let x = pr.left + m + 6; x + w <= pr.right - m - 6; x += 22) {
          const box = { l: x, t: y, r: x + w, b: y + h };
          if (bad.some((o) => hit(box, o))) continue;
          // 偏好：靠页心偏上，离书脊不要太近
          const cx = pr.left + pr.width / 2;
          const cy = pr.top + pr.height * 0.42;
          const dist = Math.hypot(x + w / 2 - cx, (y + h / 2 - cy) * 1.2);
          found.push({ x, y, d: dist + rand(0, 60) });
        }
      }
      if (found.length && pg === ps[0]) break; // 先在当前读的这一页（右页）找，找到就不去别处
    }
    if (found.length) {
      found.sort((a, b) => a.d - b.d);
      const f = found[Math.floor(Math.random() * Math.min(found.length, 6))];
      return { x: f.x, y: f.y, edge: false };
    }
    // 没有放得下的空白：写在页边（右页上缘，字带一圈纸色的柔光，不遮正文）
    const pr = ps[0] ? local(ps[0].page) : { left: 0, top: 0 };
    return { x: Math.max(8, pr.left + 18), y: pr.top + 8, edge: true };
  }

  function build(item, lead, step) {
    const el = document.createElement('p');
    el.className = 'gloss' + (item.alarm ? ' is-alarm' : '') + (reduced ? ' is-plain' : '');
    const box = document.createElement('span');
    box.className = 'gloss-t';
    const hot = numberIndexes(item.text); // 数字所在的字序，点朱
    let n = 0;
    let pos = 0;
    // 按标点切成语段，每段是不可拆的一块：只在语段之间折行，不在"3.9 秒"或一个词中间断开
    for (const clause of item.text.match(CLAUSE) ?? []) {
      const word = document.createElement('span');
      word.className = 'ink-w';
      for (const ch of clause) {
        const c = inkChar(ch, reduced ? 0 : lead + n++ * step);
        if (hot.has(pos)) c.classList.add('is-num');
        pos += ch.length;
        word.append(c);
      }
      box.append(word);
    }
    el.append(box);
    return { el, n };
  }

  async function drain() {
    busy = true;
    while (queue.length) {
      if (holding) await holding;
      if (!live) { await new Promise((r) => { resume = r; }); continue; }
      await pageReady(); // 书页还没排好（刚进卷、刚换屏）就先等一等，免得把字写在后来出现的内容底下
      if (!queue.length || !live) continue;
      const item = queue.shift();
      cur = item;
      const backlog = queue.length; // 后面还排着几条：写快些、停得短些
      const step = reduced ? 0 : backlog > 1 ? 12 : backlog ? 24 : 40;
      const { el, n } = build(item, 0, step);

      // 先量一量：这句话在几种宽度下各有多高，再去找放得下的空白
      el.classList.add('is-measure');
      host.append(el);
      let place = null;
      for (const w of WIDTHS) {
        el.style.width = `${w}px`;
        const h = el.offsetHeight;
        const p = spot(w, h);
        if (!p.edge) { place = { ...p, w }; break; }
        if (!place) place = { ...p, w };
      }
      el.classList.remove('is-measure');
      // 写在页边时没有“避开”可言：先让别的字迹快快淡去，再落笔，同一处不叠字
      if (place.edge) {
        const olds = [...host.querySelectorAll('.gloss')].filter((n) => n !== el);
        if (olds.length) {
          el.style.display = 'none';
          olds.forEach((n) => { n.classList.remove('is-sink'); n.classList.add('is-out'); setTimeout(() => n.remove(), 360); });
          await new Promise((r) => setTimeout(r, 380));
          el.style.display = '';
        }
      }
      el.style.left = `${place.x}px`;
      el.style.top = `${place.y}px`;
      el.style.width = `${place.w}px`;
      el.style.setProperty('--rot', `${rand(-0.9, 0.9).toFixed(2)}deg`);
      if (place.edge) el.classList.add('is-edge');
      item.el = el;

      await wait(item, n * step + (reduced ? 420 : 520)); // 写完
      item.written = !item.woken;
      if (!item.woken) {
        el.classList.add('is-done');
        await wait(item, backlog ? 500 : Math.min(3600, 1500 + item.text.length * 85)); // 停一会儿，让人读完
      }
      sink(el, item.woken || backlog > 2);
    }
    cur = null;
    busy = false;
  }

  // 渗进纸里、淡去
  function sink(el, quick) {
    el.classList.add(quick ? 'is-out' : 'is-sink');
    setTimeout(() => el.remove(), quick ? 360 : 2800);
  }

  // 翻页：正在写、还没写完的一条，翻过去之后接着在新的一页上重写；已经写完的就让它淡去
  function hold(promise) {
    holding = promise.then(() => { holding = null; });
    if (cur && !cur.written && !cur.woken) {
      const again = { text: cur.text, alarm: cur.alarm, key: cur.key };
      cur.wake?.();
      queue.unshift(again);
    }
    [...host.children].forEach((n) => sink(n, true));
  }

  // 回看写下的页时不开口；回到最新一页再接着写
  function setLive(on) {
    if (on === live) return;
    live = on;
    if (!on) {
      if (cur && !cur.written && !cur.woken) {
        const again = { text: cur.text, alarm: cur.alarm, key: cur.key };
        cur.wake?.();
        queue.unshift(again);
      }
      [...host.children].forEach((n) => sink(n, true));
    } else { resume?.(); resume = null; if (!busy && queue.length) drain(); }
  }

  function clear() {
    queue.length = 0;
    cur?.wake?.();
    host.replaceChildren();
  }

  return { push, clear, hold, setLive };
}
