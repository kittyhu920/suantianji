// 等元素滚进视野再播：kind 为 'ink' 时逐字洇开（ink-wait），为 'stamp' 时落印（stamp-wait）。
// 用法：<p use:inview={{ ctx, kind: 'ink' }}>
import { COLOR } from './ink.js';

export function inview(node, { ctx, kind = 'ink' }) {
  if (!('IntersectionObserver' in window)) return {};
  node.classList.remove('in', 'is-stamped');
  node.classList.add(kind === 'stamp' ? 'stamp-wait' : 'ink-wait');
  let timer = 0;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (kind === 'stamp') {
      node.classList.add('is-stamped');
      timer = setTimeout(() => { // 印落下的一刻，朱砂的水纹与溅点
        const p = ctx.fxPoint(node);
        ctx.fx.wash(p.x, p.y, { color: COLOR.zhu, R: 52, a: 0.16, grow: 0.9, hold: 0.2, fade: 1.5 });
        ctx.fx.ripple(p.x, p.y, { color: COLOR.zhu, r: 64, rings: 2, a: 0.24 });
        ctx.sfx.thud();
      }, 380);
    } else node.classList.add('in');
  }, { root: ctx.el.stage, threshold: 0.6 });
  io.observe(node);
  return { destroy() { io.disconnect(); clearTimeout(timer); } };
}
