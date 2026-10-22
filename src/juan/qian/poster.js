// 签卷的分享图：签号、签名、签级、竖排的签诗、白话大意、三杯与是否算数。
// 纸面、远山、标题、结局印、命盘与二维码在 src/core/poster.js。
// 传给 drawPoster 的 d 里，本卷的字段是：
//   sign   { no, name, level, poem[4], bai } 或 null
//   cups   三杯结果，如"圣杯 · 圣杯 · 阴杯"
//   state  这支签算不算数；stateNo 为 true 时用朱（阴杯）

import { loomStyle } from './loom-style.js';

function body(g, y, d, { W, C, TEXT, BRUSH, center, wrap }) {
  if (d.sign) {
    y += 110;
    center(g, d.sign.no, y, `34px ${TEXT}`, C.goldSoft);
    y += 118;
    center(g, d.sign.name, y, `108px ${BRUSH}`, C.gold);
    // 等级
    y += 36;
    g.font = `38px ${BRUSH}`;
    const lw = g.measureText(d.sign.level).width + 40;
    g.strokeStyle = C.goldDim;
    g.lineWidth = 2;
    g.strokeRect(W / 2 - lw / 2, y, lw, 58);
    g.fillStyle = C.gold;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.sign.level, W / 2, y + 31);

    // 签诗：竖排，自右向左
    y += 118;
    g.font = `52px ${TEXT}`;
    g.fillStyle = C.gold;
    const colGap = 96;
    const x0 = W / 2 + colGap * 1.5;
    d.sign.poem.forEach((line, i) => {
      [...line].forEach((ch, j) => g.fillText(ch, x0 - i * colGap, y + j * 66));
    });
    y += 66 * 7 + 40;

    // 白话大意
    g.textBaseline = 'alphabetic';
    center(g, '这支签在说什么', y, `40px ${BRUSH}`, C.gold);
    y += 70;
    g.font = `38px ${TEXT}`;
    g.fillStyle = C.gold;
    for (const line of wrap(g, d.sign.bai, 860)) {
      g.textAlign = 'center';
      g.fillText(line, W / 2, y);
      y += 62;
    }
  }

  // 三杯
  y += 50;
  center(g, d.cups, y, `50px ${BRUSH}`, C.gold);
  y += 56;
  center(g, d.state, y, `32px ${TEXT}`, d.stateNo ? C.cinnabarHi : C.goldSoft);
  return y;
}

export const posterSpec = {
  tagline: '你 求 签 ， 我 算 你',
  turn: '在你求签的时候，我也在给你算命。',
  qrLabel: '扫码来求一签',
  sample: (d) => [d.sign?.name, d.sign?.no, d.sign?.level, ...(d.sign?.poem ?? []), d.sign?.bai, d.cups, d.state,
    '你求签我算这支签在说什么在你求签的时候我也在给你算命扫码来求一签'].join(''),
  style: loomStyle,
  body,
};
