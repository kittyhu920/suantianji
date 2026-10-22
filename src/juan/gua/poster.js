// 卦卷的分享图：卦名、卦画、六位二进制、卦辞、六次掷法。
// 纸面、远山、标题、结局印、命盘与二维码在 src/core/poster.js。
// 传给 drawPoster 的 d 里，本卷的字段是：
//   hex      { name, upper, lower, ci, lines[6]（每一爻的数 6–9，自下而上） }
//   changed  变卦 { name, lines[6] } 或 null
//   bits     本卦的六位二进制，自下而上
//   record   六次的掷法，如"初 少阳 7 · 二 老阴 6 …"

import { loomStyle } from './loom-style.js';
import { isYang, isMoving } from './yao.js';
import { mulberry32 } from '../../core/rng.js';

const LH = 34; // 一爻的粗细
const LG = 20; // 爻与爻的间距
const FIG_H = 6 * LH + 5 * LG;

// 一幅卦画：每一爻一笔墨，阳爻整条，阴爻中间断开；变爻右边点一圈朱
function figure(g, cx, top, lines, w, { C, seed }) {
  const rnd = mulberry32(seed);
  const left = cx - w / 2;
  const gap = w * 0.14;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  lines.forEach((v, i) => {
    const y = top + (5 - i) * (LH + LG) + LH / 2;
    const parts = isYang(v) ? [[left, left + w]] : [[left, cx - gap / 2], [cx + gap / 2, left + w]];
    for (const [a, b] of parts) {
      // 一笔：先洇一层淡的，再压一层实的，最后一缕飞白
      for (const [lw, al] of [[LH * 1.35, 0.07], [LH, 0.88]]) {
        g.strokeStyle = `rgba(27,23,18,${al})`;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(a, y + (rnd() - 0.5) * 3);
        for (let x = a + 14; x < b; x += 14) g.lineTo(x, y + (rnd() - 0.5) * 3.2);
        g.lineTo(b, y + (rnd() - 0.5) * 4);
        g.stroke();
      }
      g.strokeStyle = 'rgba(239,230,208,.5)';
      g.lineWidth = 3;
      g.setLineDash([22 + rnd() * 30, 10 + rnd() * 16]);
      g.beginPath();
      g.moveTo(a + 8, y - 6);
      g.lineTo(b - 8, y - 6);
      g.stroke();
      g.setLineDash([]);
    }
    if (isMoving(v)) {
      const mx = left + w + 34;
      g.strokeStyle = C.cinnabar;
      g.lineWidth = 5;
      g.beginPath();
      if (isYang(v)) g.arc(mx, y, 13, 0, Math.PI * 2);
      else { g.moveTo(mx - 12, y - 12); g.lineTo(mx + 12, y + 12); g.moveTo(mx + 12, y - 12); g.lineTo(mx - 12, y + 12); }
      g.stroke();
    }
  });
  g.restore();
}

function body(g, y, d, { W, C, TEXT, BRUSH, center, wrap }) {
  const { hex, changed, bits } = d;
  y += 110;
  center(g, `${hex.upper}上${hex.lower}下 · ${changed ? '本卦' : '无变爻'}`, y, `34px ${TEXT}`, C.goldSoft);
  y += 118;
  center(g, hex.name, y, `108px ${BRUSH}`, C.gold);
  y += 44;

  if (changed) {
    // 本卦 → 变卦
    figure(g, W / 2 - 230, y, hex.lines, 250, { C, seed: d.seed });
    figure(g, W / 2 + 230, y, changed.lines, 250, { C, seed: d.seed ^ 77 });
    g.font = `46px ${BRUSH}`;
    g.fillStyle = C.gold;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('之', W / 2, y + FIG_H / 2);
    g.textBaseline = 'alphabetic';
    g.font = `40px ${BRUSH}`;
    g.fillText(changed.name, W / 2 + 230, y + FIG_H + 52);
    g.fillText('变卦', W / 2 + 230, y + FIG_H + 104);
  } else {
    figure(g, W / 2, y, hex.lines, 320, { C, seed: d.seed });
  }
  y += FIG_H + (changed ? 150 : 80);

  // 六位二进制：自下而上
  center(g, [...bits].join('  '), y, `64px ${TEXT}`, C.gold);
  y += 52;
  center(g, '自下而上，阳爻 1，阴爻 0：六十四卦，就是六位二进制', y, `28px ${TEXT}`, C.goldDim);

  // 卦辞
  y += 78;
  g.font = `38px ${TEXT}`;
  g.fillStyle = C.gold;
  for (const line of wrap(g, hex.ci, 840)) {
    g.textAlign = 'center';
    g.fillText(line, W / 2, y);
    y += 60;
  }

  // 六次掷法
  y += 18;
  g.font = `28px ${TEXT}`;
  g.fillStyle = C.goldSoft;
  for (const line of wrap(g, d.record, 900)) {
    g.textAlign = 'center';
    g.fillText(line, W / 2, y);
    y += 44;
  }
  return y;
}

export const posterSpec = {
  tagline: '你 起 卦 ， 我 算 你',
  turn: '在你起卦的时候，我也在给你算命。',
  qrLabel: '扫码来起一卦',
  sample: (d) => [d.hex.name, d.hex.upper, d.hex.lower, d.hex.ci, d.changed?.name, d.record, d.bits,
    '本卦变卦之无变爻上下自下而上阳爻阴爻六十四卦就是六位二进制你起卦我算在你起卦的时候我也在给你算命扫码来起一卦'].join(''),
  style: loomStyle,
  body,
};
