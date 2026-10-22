// 悬停时的轻微透视倾斜：纸做的卡片（签卡、龟甲卡）随鼠标位置偏几度，文字始终是正面朝向、清晰可读。
// 只在有鼠标时生效；减少动效下不做。实现是给元素设两个 CSS 变量（--tilt-x / --tilt-y），transform 在各自的样式里。

const MAX_X = 3.2; // 度
const MAX_Y = 4.2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export function mountTilt(root, selector = '.sign, .card') {
  if (!root) return () => {};
  let cur = null;

  const reset = () => {
    if (!cur) return;
    cur.style.removeProperty('--tilt-x');
    cur.style.removeProperty('--tilt-y');
    cur = null;
  };
  const move = (e) => {
    if (e.pointerType !== 'mouse' || reduced.matches) return;
    const el = e.target instanceof Element ? e.target.closest(selector) : null;
    if (el !== cur) reset();
    if (!el) return;
    cur = el;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--tilt-y', `${(px * 2 * MAX_Y).toFixed(2)}deg`);
    el.style.setProperty('--tilt-x', `${(-py * 2 * MAX_X).toFixed(2)}deg`);
  };

  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', reset);
  return () => {
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerleave', reset);
    reset();
  };
}
