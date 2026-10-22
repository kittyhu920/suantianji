// 签卷的织法（命盘的框架在 src/core/loom.js）：
// 圣杯的丝平直穿过；笑杯的丝在右半绞成一个结，又回到原位；
// 阴杯的丝过了中缝向上下分开，并由墨转为朱，右半淡淡地带朱。

import { LOOM, smoothstep, lerp } from '../../core/loom.js';

export const loomStyle = {
  halos: (kind) => (kind === 'yin' ? [{ cx: 0.74, rx: 0.3, ry: 1.05, color: LOOM.zhu, a: 0.07 }] : []),

  offset(kind, off, o, x, { W, thick }) {
    if (kind === 'yin') {
      const f = smoothstep(W * 0.5, W * 0.62, x);
      const parted = Math.sign(o || 1) * (thick * 0.52 + Math.abs(o) * thick * 0.14);
      return lerp(off, parted, f);
    }
    if (kind === 'xiao') {
      const t = Math.min(1, Math.max(0, (x - W * 0.52) / (W * 0.3)));
      return off * Math.cos(t * Math.PI * 2); // 绞成一个结，再回到原位
    }
    return off;
  },

  color(kind, x, W) {
    if (kind !== 'yin') return null;
    const t = smoothstep(W * 0.44, W * 0.56, x);
    return [0, 1, 2].map((i) => Math.round(lerp(LOOM.ink[i], LOOM.zhu[i], t)));
  },
};
