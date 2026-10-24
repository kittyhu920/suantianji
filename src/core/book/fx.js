// 书自己的动作（docs/DESIGN.md §19）：克制，不干扰阅读。减少动效下一律不播。
//   tremble  犹豫时，书轻轻颤一下
//   riffle   重来时，封面掀一下再落回（"合上这一页，再翻开一页新的"）
//   thud     结局时，书沉一下
//   tear     存疑时，封面被撕开一道
// 都只改 transform 与 opacity，作用在合着的书（.book）上。

import { bookEl } from './stage.svelte.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pulse(cls, ms) {
  const el = bookEl.el;
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

export const tremble = () => pulse('is-tremble', 900);
export const thud = () => pulse('is-thud', 600);
export const riffle = () => pulse('is-riffle', 1300);

// 撕口：从封面的上缘到下缘，一道锯齿
function tearLine(w, h) {
  const pts = [];
  let x = w * (0.4 + Math.random() * 0.2);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    pts.push([x, (h * i) / n]);
    x += (Math.random() - 0.5) * 22;
    x = Math.max(w * 0.25, Math.min(w * 0.8, x));
  }
  return pts;
}

/** 封面被撕开一道：两半向两边错开。返回的 Promise 在撕完（两半落定）之后结束 */
export async function tear() {
  const book = bookEl.el;
  const face = book?.querySelector('.cv-front');
  if (!face || reduced()) { await sleep(500); return; }
  const w = face.offsetWidth;
  const h = face.offsetHeight;
  const line = tearLine(w, h);
  const poly = (side) => {
    const edge = side === 'l' ? [[0, 0], ...line, [0, h]] : [[w, 0], ...line, [w, h]];
    return `polygon(${edge.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
  };
  const halves = ['l', 'r'].map((side) => {
    const half = face.cloneNode(true);
    half.classList.add('cv-tear');
    half.style.clipPath = poly(side);
    face.parentElement.append(half);
    return half;
  });
  face.style.visibility = 'hidden';
  const go = (el, dx, dy, rot) => el.animate(
    [{ transform: 'none' }, { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg)` }],
    { duration: 900, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
  ).finished;
  await Promise.all([go(halves[0], -18, 6, -2.2), go(halves[1], 22, -3, 2.6)]);
  await sleep(700);
  halves.forEach((n) => n.remove());
  face.style.visibility = '';
}
