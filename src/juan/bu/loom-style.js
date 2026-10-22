// 卜卷的织法（命盘的框架在 src/core/loom.js）：每一灼是一束丝，丝的形态由这一灼的兆象定。
//   吉　　 平直穿过
//   小吉　 微微起伏
//   亡尤　 收窄、平静
//   弗吉　 过了中缝向上下分开，右半转为赭红
//   有祟　 分得更开，起伏也更乱，赭红更重
// 改判（王占曰）的那一束，kind 带一个 * ：丝在中缝处断开一小段，接上之后改用朱，像朱批落下。

import { LOOM, smoothstep, lerp } from '../../core/loom.js';
import { HEAT } from './crack.js';

const base = (kind) => kind.replace('*', '');

export const loomStyle = {
  halos: (kind) => {
    const k = base(kind);
    if (k === 'fuji') return [{ cx: 0.74, rx: 0.3, ry: 1.0, color: HEAT, a: 0.06 }];
    if (k === 'yousui') return [{ cx: 0.72, rx: 0.34, ry: 1.1, color: HEAT, a: 0.1 }];
    return [];
  },

  offset(kind, off, o, x, { W, thick }) {
    const k = base(kind);
    if (k === 'fuji' || k === 'yousui') {
      const f = smoothstep(W * 0.5, W * 0.62, x);
      const spread = k === 'yousui' ? 0.7 : 0.5;
      const parted = Math.sign(o || 1) * (thick * spread + Math.abs(o) * thick * 0.14);
      const jag = k === 'yousui' ? Math.sin(x * 0.19 + o * 5) * thick * 0.06 * f : 0;
      return lerp(off, parted, f) + jag;
    }
    if (k === 'xiaoji') return off + Math.sin((x / W) * Math.PI * 4 + o * 3) * thick * 0.08;
    if (k === 'wuyou') return off * 0.55;
    return off;
  },

  color(kind, x, W) {
    const k = base(kind);
    if (kind.endsWith('*')) {
      if (x > W * 0.47 && x < W * 0.52) return [255, 255, 255]; // 断口：相乘叠色下近乎隐形
      if (x >= W * 0.52) {
        const t = smoothstep(W * 0.52, W * 0.58, x);
        return [0, 1, 2].map((i) => Math.round(lerp(LOOM.ink[i], LOOM.zhu[i], t)));
      }
      return null;
    }
    if (k !== 'fuji' && k !== 'yousui') return null;
    const t = smoothstep(W * 0.44, W * 0.56, x) * (k === 'yousui' ? 1 : 0.8);
    return [0, 1, 2].map((i) => Math.round(lerp(LOOM.ink[i], HEAT[i], t)));
  },
};
