// 残印：封面上每一卷一个印，四种结局各占印的一角（左上 遵、右上 逆、左下 破、右下 迷），得了哪一角就显出哪一角，
// 没得的那一角是断痕与缺损，集齐四角才是完整一方（docs/DESIGN.md §19“残印位”）。
// 复用 paint.js 的 seal() 画一方完整的印，再把没得的角擦掉：擦出来的边是断裂的（同一条分界线上，相邻两角用同一份抖动，
// 所以“旧的部分”与“这一局新得的部分”分开画再叠起来，接缝严丝合缝），缺的角靠近断口处留几点朱色的碎屑。

import { seal } from './paint.js';
import { mulberry32 } from '../rng.js';

/** 封面上的四个残印位：签、卦、卜（已开）、星（未开卷，位置留着） */
export const SLOTS = [
  { id: 'qian', ch: '签' },
  { id: 'gua', ch: '卦' },
  { id: 'bu', ch: '卜' },
  { id: 'xing', ch: '星' },
];

const STEPS = 12;

function jags(rand, s) {
  const run = () => { const a = [0]; for (let i = 1; i <= STEPS; i++) a.push((rand() - 0.5) * s * (i % 4 === 0 ? 0.16 : 0.09)); return a; };
  return { vp: run(), vn: run(), hp: run(), hn: run() }; // 竖分界线的上下半、横分界线的左右半
}

/**
 * 在 (cx, cy) 画一方边长 s 的印，parts 是 [左上, 右上, 左下, 右下] 四个角得没得（布尔）。
 * residue 为假时不留碎屑（画“只有新得的那一角”用）。parts 全空就什么也不画。
 */
export function paintSealParts(g, cx, cy, size, ch, seed, parts, { residue = true } = {}) {
  if (!parts.some(Boolean)) return;
  // 先按大尺寸画（seal() 的剥蚀碎点是为海报的大印定的，印小了碎点就显得太粗），再缩进去
  const s = Math.max(size, 300);
  const T = Math.ceil(s * 1.5);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = T;
  const t = tmp.getContext('2d');
  const c = T / 2;
  seal(t, c, c, s, ch, seed);
  if (!parts.every(Boolean)) {
    const rand = mulberry32((seed * 97 + 13) >>> 0);
    const J = jags(rand, s);
    const far = s; // 够远，擦过印的边
    const step = far / STEPS;
    t.save();
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = '#000';
    parts.forEach((got, q) => {
      if (got) return;
      const sx = q % 2 ? 1 : -1; // 左 / 右
      const sy = q < 2 ? -1 : 1; // 上 / 下
      const vj = sy < 0 ? J.vn : J.vp;
      const hj = sx < 0 ? J.hn : J.hp;
      t.beginPath();
      t.moveTo(c + sx * far, c + sy * far);
      t.lineTo(c + vj[STEPS], c + sy * far); // 竖分界线从远处走回中心
      for (let i = STEPS - 1; i >= 0; i--) t.lineTo(c + vj[i], c + sy * i * step);
      for (let i = 1; i <= STEPS; i++) t.lineTo(c + sx * i * step, c + hj[i]); // 再沿横分界线走出去
      t.closePath();
      t.fill();
    });
    t.restore();
    if (residue) {
      // 断口附近散落几点没擦净的朱：离断口越远越稀
      t.fillStyle = 'rgba(176,38,31,.8)';
      const n = Math.round(s * 0.9);
      for (let i = 0; i < n; i++) {
        const x = (rand() - 0.5) * s;
        const y = (rand() - 0.5) * s;
        const q = (y < 0 ? 0 : 2) + (x < 0 ? 0 : 1);
        if (parts[q] || Math.hypot(x, y) > s * 0.36) continue;
        const d = Math.min(Math.abs(x), Math.abs(y)) / (s / 2); // 离分界线多远（0–1）
        if (rand() > 0.34 * Math.pow(1 - d, 2.4)) continue;
        t.globalAlpha = 0.35 + rand() * 0.5;
        t.beginPath();
        t.arc(c + x, c + y, 0.5 + rand() * s * 0.012, 0, Math.PI * 2);
        t.fill();
      }
      t.globalAlpha = 1;
    }
  }
  const k = size / s;
  g.drawImage(tmp, cx - c * k, cy - c * k, T * k, T * k);
}

/** 一个残印位的画布（边长 px，正方，透明底）；slotIndex 决定印的种子 */
export function sealCanvas(slotIndex, parts, px = 192, opts) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const g = cv.getContext('2d');
  paintSealParts(g, px / 2, px / 2, px * 0.86, SLOTS[slotIndex].ch, 21 + slotIndex * 7, parts, opts);
  return cv;
}
