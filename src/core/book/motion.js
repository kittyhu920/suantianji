// 书自己的动作（docs/DESIGN.md §19）：克制，不干扰阅读。减少动效下一律不播。
//   tremble  犹豫时，书页轻轻颤一下
//   shut     重来时，书合拢一下再打开（合拢时才换内容）
//   tear     存疑时，右页被撕开一道
//   thud     结局时，印落在页上，书沉一下
// 都只改 transform 与 opacity：颤与沉作用在整本书（.book，含封面与纸边），合拢作用在两页、封面与纸边上；翻页的纸见 flip.js。

import { snapshot } from './flip.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 书页轻颤：像被谁碰了一下 */
export function tremble(huaxin) {
  const book = huaxin?.parentElement; // 整本书一起动（封面、纸边、投影都在 .book 里），不会露出底下的一圈
  if (!book || reduced()) return;
  book.classList.remove('is-tremble');
  void book.offsetWidth;
  book.classList.add('is-tremble');
  setTimeout(() => book.classList.remove('is-tremble'), 900);
}

/** 书沉一下：印落下的一刻 */
export function thud(huaxin) {
  const book = huaxin?.parentElement;
  if (!book || reduced()) return;
  book.classList.remove('is-thud');
  void book.offsetWidth;
  book.classList.add('is-thud');
  setTimeout(() => book.classList.remove('is-thud'), 600);
}

/**
 * 合拢再打开：两页绕书脊立起，合成窄窄的一条；合拢的一刻调用 commit() 换内容；再打开。
 * 返回的 Promise 在书重新打开之后结束。
 */
export async function shut(huaxin, commit) {
  if (!huaxin || reduced() || document.hidden) { commit(); return; }
  const book = huaxin.parentElement; // 封面、页边的厚度、投影都在书里，和两页一起合拢
  const q = (s) => book.querySelector(s);
  const L = huaxin.querySelector('.pg-left');
  const R = huaxin.querySelector('.pg-right');
  const mobile = matchMedia('(max-width: 959px)').matches;
  const open = { transform: 'perspective(2600px) rotateY(0deg)' };
  const to = (sgn) => ({ transform: `perspective(2600px) rotateY(${sgn * (mobile ? 70 : 82)}deg)` });
  const opt = (ms, easing) => ({ duration: ms, easing, fill: 'forwards' });
  const left = mobile ? [] : [L, q('.cov-l'), q('.bk-l')].filter(Boolean);
  const right = [R, q('.cov-r'), q('.bk-r')].filter(Boolean);
  left.forEach((n, i) => { if (i) n.style.transformOrigin = '100% 50%'; });
  right.forEach((n, i) => { if (i) n.style.transformOrigin = '0 50%'; });
  const shadow = q('.bk-shadow');
  const sh = (a, b2) => shadow?.animate([{ transform: `scaleX(${a})` }, { transform: `scaleX(${b2})` }], opt(a < b2 ? 520 : 430, 'ease-in-out'));
  huaxin.classList.add('is-shut');
  const ease1 = 'cubic-bezier(.5,0,.85,.4)';
  const close = [...left.map((n) => n.animate([open, to(1)], opt(430, ease1))), ...right.map((n) => n.animate([open, to(-1)], opt(430, ease1))), sh(1, 0.2)].filter(Boolean);
  await Promise.all(close.map((a) => a.finished));
  commit();
  await sleep(220);
  const ease2 = 'cubic-bezier(.2,.7,.2,1)';
  const openAgain = [...left.map((n) => n.animate([to(1), open], opt(520, ease2))), ...right.map((n) => n.animate([to(-1), open], opt(520, ease2))), sh(0.2, 1)].filter(Boolean);
  await Promise.all(openAgain.map((a) => a.finished));
  close.forEach((a) => a.cancel());
  openAgain.forEach((a) => a.cancel());
  [...left, ...right].forEach((n) => { n.style.transformOrigin = ''; });
  huaxin.classList.remove('is-shut');
}

// 撕口：从页的上缘到下缘，一道锯齿
function tearLine(w, h) {
  const pts = [];
  let x = w * (0.36 + Math.random() * 0.26);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    pts.push([x, (h * i) / n]);
    x += (Math.random() - 0.5) * 26;
    x = Math.max(w * 0.2, Math.min(w * 0.8, x));
  }
  return pts;
}

/** 右页被撕开一道：两半向两边错开。返回的 Promise 在撕完（两半落定）之后结束 */
export async function tear(huaxin, stage) {
  if (!huaxin || !stage || reduced()) { await sleep(500); return; }
  const pg = stage.closest('.pg-right') ?? stage;
  const pr = { left: pg.offsetLeft, top: pg.offsetTop, width: pg.offsetWidth, height: pg.offsetHeight }; // 布局尺寸，不受场景缩放与倾斜影响
  if (!pr.width) { await sleep(500); return; }
  const line = tearLine(pr.width, pr.height);
  const poly = (side) => {
    const edge = side === 'l' ? [[0, 0], ...line.map(([x, y]) => [x, y]), [0, pr.height]] : [[pr.width, 0], ...line.map(([x, y]) => [x, y]), [pr.width, pr.height]];
    return `polygon(${edge.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
  };
  const layer = document.createElement('div');
  layer.className = 'tear';
  layer.style.cssText = `left:${pr.left}px;top:${pr.top}px;width:${pr.width}px;height:${pr.height}px`;
  const halves = ['l', 'r'].map((side) => {
    const wrap = document.createElement('div');
    wrap.className = 'tear-half';
    const inner = document.createElement('div');
    inner.className = 'tear-in';
    inner.style.clipPath = poly(side);
    const content = snapshot(stage);
    content.style.cssText = 'position:absolute;inset:0;';
    inner.append(content);
    wrap.append(inner);
    layer.append(wrap);
    return wrap;
  });
  huaxin.append(layer);
  stage.style.visibility = 'hidden';
  const go = (el, dx, dy, rot, ms) => el.animate(
    [{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)` }],
    { duration: ms, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
  ).finished;
  await Promise.all([go(halves[0], -26, 8, -2.4, 900), go(halves[1], 30, -4, 3, 900)]);
  await sleep(700);
  layer.remove();
  stage.style.visibility = '';
}
