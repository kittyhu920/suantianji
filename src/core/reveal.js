// 换屏转场：新的一屏从指尖按下的地方像水墨一样洇开（CSS @property --r + 径向蒙版，见 styles/base.css）。
// 老浏览器不支持 @property 时，由调用方退回淡入。

export function revealScreen(ctx, next) {
  const box = ctx.el.stage.getBoundingClientRect();
  const hux = ctx.el.huaxin.getBoundingClientRect();
  const tap = ctx.lastTap && performance.now() - ctx.lastTap.t < 2500 ? ctx.lastTap : null;
  // 点按位置相对画心，换算到舞台（舞台与画心左上角重合）
  const x = tap ? tap.x : box.width / 2;
  const y = tap ? tap.y : box.height * 0.42;
  next.style.setProperty('--ox', `${Math.round(x)}px`);
  next.style.setProperty('--oy', `${Math.round(y)}px`);
  next.style.setProperty('--rmax', `${Math.ceil(Math.hypot(Math.max(x, box.width - x), Math.max(y, hux.height - y))) + 60}px`);
  next.classList.add('is-reveal');
  const done = (e) => {
    if (e.target !== next) return; // 屏里其他元素的动画结束不算
    next.classList.remove('is-reveal');
    next.removeEventListener('animationend', done);
  };
  next.addEventListener('animationend', done);
  ctx.fx.ripple(x, y, { r: Math.min(260, parseFloat(next.style.getPropertyValue('--rmax')) * 0.45), rings: 2, dur: 1.6, a: 0.14 });
}
