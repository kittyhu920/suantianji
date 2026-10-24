// 命书的页怎么画（docs/DESIGN.md §19）：每一页是一张 Canvas 2D 画出来的纹理，设计尺寸 PW × PH（5:7），
// 画布按 dpr 放大（Reader 里 scale）。这里是各页共用的笔法：纸、标题、段落、竖排、页码。
// 复用分享图（core/poster.js）的墨色、字体、折行与印章；字体要等加载完成再画（loadFonts）。
// 页上的字都是墨（#1b1712 一路淡下去），朱只用在印章、阴杯、最终判词等老规矩的地方。

import { C, TITLE, TEXT, wrap, seal } from '../poster.js';
import { mulberry32 } from '../rng.js';
import { cn } from '../cn.js';

export { C, seal };
export const PW = 600;
export const PH = 840;
export const MARGIN = 52;

export const F = {
  display: TITLE, // 标题、卷名、结局名（--f-display）
  text: TEXT, // 正文（--f-text）
  kai: '"LXGW WenKai", "STKaiti", "KaiTi", "Kaiti SC", "Noto Serif SC", serif', // 旁注、坦白（--f-kai）
  voice: '"Long Cang", "LXGW WenKai", "STKaiti", "KaiTi", serif', // 书自己的字（--f-voice）：问题与书的话
};

/** 画页之前要等字体加载完：sample 是所有页上会出现的字 */
export async function loadFonts(sample) {
  const s = sample.slice(0, 4000);
  await Promise.all([
    document.fonts.load(`40px ${F.display}`, s),
    document.fonts.load(`28px ${F.text}`, s),
    document.fonts.load(`28px ${F.kai}`, s),
    document.fonts.load(`28px ${F.voice}`, s),
  ]);
}

/** 一页的底：宣纸、纤维、泛黄的四角；订口一侧（side 'L' 在右边、'R' 在左边）略暗，提示弧面 */
export function ground(g, seed, side) {
  g.fillStyle = '#ece1c8';
  g.fillRect(0, 0, PW, PH);
  const rand = mulberry32(seed);
  for (let i = 0; i < 2600; i++) { // 纸纹：横向拉长的纤维颗粒
    g.fillStyle = `rgba(110,88,56,${(rand() * 0.06).toFixed(3)})`;
    g.fillRect(rand() * PW, rand() * PH, 1 + rand() * 5, 1.1);
  }
  for (const [x, y] of [[0, 0], [PW, 0], [0, PH], [PW, PH]]) { // 四角泛黄
    const gr = g.createRadialGradient(x, y, 0, x, y, 190);
    gr.addColorStop(0, 'rgba(150,108,44,.16)');
    gr.addColorStop(1, 'rgba(150,108,44,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, PW, PH);
  }
  const gx = side === 'L' ? PW : 0;
  const gg = g.createLinearGradient(gx, 0, side === 'L' ? PW - 90 : 90, 0);
  gg.addColorStop(0, 'rgba(40,24,6,.26)');
  gg.addColorStop(1, 'rgba(40,24,6,0)');
  g.fillStyle = gg;
  g.fillRect(0, 0, PW, PH);
}

/** 页码：外侧下角，汉字数字（扉页不写） */
export function folio(g, n, side) {
  g.font = `20px ${F.display}`;
  g.fillStyle = C.goldDim;
  g.textBaseline = 'alphabetic';
  g.textAlign = side === 'L' ? 'left' : 'right';
  g.fillText(cn(n), side === 'L' ? MARGIN : PW - MARGIN, PH - 34);
}

/** 页标题：显示字体，居中，下面一道淡墨的横线。返回下一行的 y */
export function heading(g, text, y = 110, size = 40) {
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = `${size}px ${F.display}`;
  g.fillStyle = C.gold;
  g.fillText([...text].join(' '), PW / 2, y);
  g.strokeStyle = C.goldFaint;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(PW / 2 - 70, y + 18);
  g.lineTo(PW / 2 + 70, y + 18);
  g.stroke();
  return y + 62;
}

/**
 * 一段字，按宽度折行，返回下一行的 y。
 * opts：size、lh（行高）、color、font、align（left | center）、x、w、indent
 */
export function para(g, text, y, { size = 24, lh = 1.75, color = C.gold, font = F.text, align = 'left', x = MARGIN, w = PW - MARGIN * 2, indent = 0 } = {}) {
  g.font = `${size}px ${font}`;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  g.textAlign = align;
  const lines = wrap(g, text, w - indent);
  lines.forEach((line, i) => {
    const lx = align === 'center' ? x + w / 2 : x + (i === 0 ? indent : 0);
    g.fillText(line, lx, y + size);
    y += size * lh;
  });
  return y + size * 0.15;
}

/** 竖排：从右向左的几列，每列一个字符串；返回最左一列的 x */
export function vtext(g, cols, x, y, { size = 40, pitch = size * 1.28, gap = size * 1.9, font = F.text, color = C.gold } = {}) {
  g.font = `${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  cols.forEach((col, i) => {
    [...col].forEach((ch, j) => g.fillText(ch, x - i * gap, y + j * pitch));
  });
  return x - (cols.length - 1) * gap;
}

/** 一行小标题加一段正文（"这支签在说什么"之类） */
export function item(g, title, text, y, { w = PW - MARGIN * 2, size = 23 } = {}) {
  g.font = `${size + 2}px ${F.display}`;
  g.fillStyle = C.gold;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(title, MARGIN, y + size);
  return para(g, text, y + size + 6, { size, w });
}

/** 一条细线 */
export function rule(g, y, a = MARGIN, b = PW - MARGIN) {
  g.strokeStyle = C.goldFaint;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(a, y);
  g.lineTo(b, y);
  g.stroke();
}
