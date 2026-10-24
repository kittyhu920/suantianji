// 书的手势：点页翻页、拖页角翻页、方向键翻页（docs/DESIGN.md §19）。
//   右页往左拖、点右页：往后翻；左页往右拖、点左页：往前翻。往后翻不动时（最新的一页之后），书会抗拒、弹回。
// 页里的按钮、输入框、链接、术语不触发翻页；拖动时纸跟着指尖走，松手时拖过一小半就翻过去，否则弹回。

import { nav, target, beginDrag, flip, bounce } from './book.svelte.js';
import { bookMap } from './geo.js';

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable], .zhu-term, .zhu-pop, [data-noflip], .poster';
const SLOP = 9; // 拖多远才算拖（像素）

/**
 * @param {HTMLElement} huaxin  书的两页所在的容器
 * @param {{ left: HTMLElement, right: HTMLElement, mobile: () => boolean, resist: () => void }} o
 *   left、right：左右两页（.pg）；resist：往后翻不动时，大师说一句
 */
export function mountGesture(huaxin, { left, right, mobile, resist }) {
  let st = null; // 正在按着：{ id, dir, x0, y0, page, hinge, w, off, drag, dead, el }

  function down(e) {
    if (e.button || !e.isPrimary || flip.on) return;
    if (e.target.closest?.(INTERACTIVE)) return;
    const pageEl = e.target.closest?.('.pg-right, .pg-left');
    if (!pageEl || (pageEl.classList.contains('pg-left') && mobile())) return;
    const dir = pageEl.classList.contains('pg-right') ? 1 : -1;
    if (e.pointerType === 'mouse') e.preventDefault(); // 在页上按下拖动是翻页，不是选字
    st = { id: e.pointerId, dir, x0: e.clientX, y0: e.clientY, drag: null, dead: false, moved: false };
  }

  function move(e) {
    if (!st || e.pointerId !== st.id || st.dead) return;
    const dx = e.clientX - st.x0;
    const dy = e.clientY - st.y0;
    if (!st.moved) {
      if (Math.hypot(dx, dy) < SLOP) return;
      st.moved = true;
      // 纵向为主：让页面自己滚（长文）；方向不对：不是翻页
      if (Math.abs(dy) > Math.abs(dx) * 1.2 || dx * st.dir > 0) { st.dead = true; return; }
      const t = target(st.dir);
      if (!t) { // 翻不动：抗拒
        st.dead = true;
        if (st.dir > 0) resist();
        bounce(st.dir);
        return;
      }
      // 在页面坐标里算（书在缩放、倾斜过的场景里，屏幕上的横向距离不等于页面里的）
      st.map = bookMap(huaxin);
      st.w = (st.dir > 0 ? right : left).offsetWidth;
      st.spine = mobile() ? 0 : huaxin.offsetWidth / 2; // 书脊：两页的交界（手机单页：页的左缘）
      st.maxRot = mobile() ? 104 : 180;
      const e0 = st.dir > 0 ? 0 : 1;
      const down = st.map.toLocal(st.x0, st.y0)[0];
      st.off = (st.spine + st.w * Math.cos((st.maxRot * e0 * Math.PI) / 180)) - down; // 纸的自由边相对按下处的位置
      st.drag = beginDrag(t.commit, t.revert, st.dir);
      if (!st.drag) { st.dead = true; return; }
      huaxin.classList.add('is-dragging');
      try { huaxin.setPointerCapture?.(e.pointerId); } catch { /* 部分浏览器不支持 */ }
    }
    if (!st.drag) return;
    e.preventDefault?.();
    const x = st.map.toLocal(e.clientX, e.clientY)[0];
    const c = Math.max(-1, Math.min(1, (x + st.off - st.spine) / st.w));
    st.drag.set((Math.acos(c) * 180) / Math.PI / st.maxRot, e.timeStamp || performance.now());
  }

  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    huaxin.classList.remove('is-dragging');
    try { huaxin.releasePointerCapture?.(e.pointerId); } catch { /* 同上 */ }
    if (s.drag) { s.drag.release(); return; } // 过没过中线、手的速度，由 beginDrag 的手柄判断
    if (!s.moved && e.type === 'pointerup') nav(s.dir); // 点一下：翻一页
  }

  const cancel = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const s = st;
    st = null;
    huaxin.classList.remove('is-dragging');
    s.drag?.release();
  };

  function key(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); nav(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1); }
  }

  huaxin.addEventListener('pointerdown', down);
  huaxin.addEventListener('pointermove', move);
  huaxin.addEventListener('pointerup', up);
  huaxin.addEventListener('pointercancel', cancel);
  addEventListener('keydown', key);
  return () => {
    huaxin.removeEventListener('pointerdown', down);
    huaxin.removeEventListener('pointermove', move);
    huaxin.removeEventListener('pointerup', up);
    huaxin.removeEventListener('pointercancel', cancel);
    removeEventListener('keydown', key);
  };
}
