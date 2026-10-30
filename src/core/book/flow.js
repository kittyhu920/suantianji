// 长的内容：先排版、再分页（docs/DESIGN.md §19）。
// 坦白、账本这类内容一页放不下。排版在做页描述的时候就完成（用一块空画布量字宽；中文字宽是固定的，不必等字体加载），
// 得到 [ops[]]：每页一串画法（文字一行一笔）。这样总页数在翻页之前就是确定的。

import { wrap } from '../poster.js';
import { C, F, PW, PH, MARGIN } from './paint.js';

let scratch = null;
const measure = () => (scratch ??= document.createElement('canvas').getContext('2d'));

/**
 * 把一串块排成若干页。块的种类：
 *   { k: 'p', text, size, font, color, align, gap }   一段字
 *   { k: 'h', text, size }                             小标题（显示字体）
 *   { k: 'kv', key, value, note }                      一行账：名、值，下面一条旁注
 *   { k: 'sp', h }                                     空一段
 * top / bottom：每页可用的纵向范围；first：第一页从哪里开始（标题占掉了上面）
 */
export function flow(blocks, { top = 160, bottom = PH - 74, first = 170 } = {}) {
  const g = measure();
  const w = PW - MARGIN * 2;
  const pages = [[]];
  let y = first;
  const put = (op, h) => {
    if (y + h > bottom && pages[pages.length - 1].length) { pages.push([]); y = top; }
    pages[pages.length - 1].push({ ...op, y });
    y += h;
  };
  const lines = (text, size, font, width = w) => { g.font = `${size}px ${font}`; return wrap(g, text, width); };
  for (const b of blocks) {
    if (b.k === 'sp') { y += b.h; continue; }
    if (b.k === 'h') {
      const size = b.size ?? 26;
      put({ text: b.text, size, font: F.display, color: C.gold, align: 'left' }, size * 1.9);
    } else if (b.k === 'p') {
      const size = b.size ?? 22;
      const font = b.font ?? F.text;
      const lh = size * 1.72;
      for (const line of lines(b.text, size, font)) put({ text: line, size, font, color: b.color ?? C.gold, align: b.align ?? 'left' }, lh);
      y += b.gap ?? size * 0.55;
    } else if (b.k === 'kv') {
      const ks = 21;
      const vs = 23;
      const ns = 22; // 旁注：命书的页 600 宽缩到屏幕上约 0.75 倍，22 → 屏幕上约 16px（≥ 14px）
      const vl = lines(b.value, vs, F.text, w);
      const nl = b.note ? lines(b.note, ns, F.kai, w - 20) : [];
      const h = ks * 1.6 + vl.length * vs * 1.65 + nl.length * ns * 1.65 + 12;
      if (y + h > bottom) { pages.push([]); y = top; }
      const page = pages[pages.length - 1];
      page.push({ text: b.key, size: ks, font: F.display, color: C.goldDim, align: 'left', y });
      y += ks * 1.6;
      for (const line of vl) { page.push({ text: line, size: vs, font: F.text, color: C.gold, align: 'left', y }); y += vs * 1.65; }
      for (const line of nl) { page.push({ text: line, size: ns, font: F.kai, color: C.goldSoft, align: 'left', x: MARGIN + 20, y }); y += ns * 1.65; }
      y += 12;
    }
  }
  return pages;
}

export function drawOps(g, ops) {
  g.textBaseline = 'alphabetic';
  for (const o of ops) {
    g.font = `${o.size}px ${o.font}`;
    g.fillStyle = o.color;
    g.textAlign = o.align;
    const x = o.x ?? (o.align === 'center' ? PW / 2 : MARGIN);
    g.fillText(o.text, x, o.y + o.size);
  }
}
