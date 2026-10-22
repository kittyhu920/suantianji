// 卦卷的织法（命盘的框架在 src/core/loom.js）：一爻一束丝，自下而上。
// 少阳的丝平直穿过（阳爻是一整条）；少阴的丝在中间分开（阴爻中间断开）；
// 老阳的丝在中段胀成一个圈（〇），老阴的丝在中段交叉（×）；这两种是变爻，中段的丝里带一点朱，身后晕一团淡朱。

import { LOOM, smoothstep, lerp } from '../../core/loom.js';

const moving = (kind) => kind === 'laoyang' || kind === 'laoyin';
// 中段：横坐标 0.34W 到 0.66W，0 → 1 → 0
const bump = (x, W) => {
  const t = Math.min(1, Math.max(0, (x - W * 0.34) / (W * 0.32)));
  return { t, b: Math.sin(t * Math.PI) };
};

export const loomStyle = {
  halos: (kind) => (moving(kind) ? [{ cx: 0.5, rx: 0.2, ry: 1.0, color: LOOM.zhu, a: 0.06 }] : []),

  offset(kind, off, o, x, { W, thick }) {
    const { t, b } = bump(x, W);
    if (kind === 'shaoyin') return off + Math.sign(o || 1) * thick * 0.5 * b;
    if (kind === 'laoyang') return off * (1 + 0.95 * b);
    if (kind === 'laoyin') return off * Math.cos(t * Math.PI) + Math.sign(o || 1) * thick * 0.18 * b;
    return off;
  },

  color(kind, x, W) {
    if (!moving(kind)) return null;
    const w = smoothstep(W * 0.36, W * 0.46, x) * (1 - smoothstep(W * 0.54, W * 0.64, x));
    return [0, 1, 2].map((i) => Math.round(lerp(LOOM.ink[i], LOOM.zhu[i], w * 0.65)));
  },
};
