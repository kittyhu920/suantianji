// 书：当前这一屏（spread）的登记、写下的页的记录、翻页的编排（docs/DESIGN.md §19）。
//
// 每一屏是一个“对页”：左页是大师的页（这一步的名字、说明），右页是玩家的页（写下的结果）。
// 屏里用 <Spread> 登记这一对页的信息（名字、说明、页脚的按钮、案上的器物），Codex 把它们排进书、案与页脚。
//
// 写下的页：一屏写完、翻到下一屏时，旧的两页被封存成一份快照（hist），可以往回翻看，只读。
// 最新的一屏（live）才是活的；往后最多翻到它，再往后，书会抗拒（Codex 提供 resist）。
//   view.pos   现在显示的是第几个对页（0 起）；等于 view.live 时，显示的是活的一屏
//   view.live  最新一个对页的序号（= 已封存的页数）
//
// 换屏 turn(commit, { dir, record }) 负责：先给旧的两页拍快照，提交状态，再把右页翻过去。
// 翻页的纸本身见 flip.js；拖页角翻页用 beginDrag，点页翻页与抗拒见 gesture.js。

import { tick } from 'svelte';
import { snapshot, playLeaf, createLeaf, springTo } from './flip.js';

let cur = $state.raw(null);
export const spread = {
  get cur() { return cur; },
};

/** 屏登记自己这一对页；返回注销函数 */
export function registerSpread(entry) {
  cur = entry;
  return () => { if (cur === entry) cur = null; };
}

export const flip = $state({ on: false, dir: 1, fps: 0 });
export const view = $state({ pos: 0, live: 0 });

// 翻页开始与结束，广播给字盘（它在翻页时暂停渲染）
const announce = (on) => { try { document.dispatchEvent(new CustomEvent('stj-flip', { detail: on })); } catch { /* 没有 document 就不用广播 */ } };

const hist = []; // 已封存的对页：{ L, R }（两页的快照）
let env = null; // { shell, right, left, mobile(), reduced, snaps(l,r), review(entry|null), ready() }
let running = null;
let seq = 0;
const subs = new Set();

export function attachBook(e) {
  env = e;
  return () => { env = null; running?.finish(); running = null; };
}

/** 翻页前后要做的事（眉批暂缓、浮注收起）：返回取消函数 */
export function onFlip(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** 新的一册：清掉写下的页（回卷首、再来一局、换了一卷） */
export function resetBook() {
  hist.length = 0;
  view.pos = 0;
  view.live = 0;
  env?.review(null);
}

export const histLength = () => hist.length;
export const viewing = () => view.pos < hist.length; // 正在回看写下的页

const PAGE_MS = 1100;
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** 回到最新的一屏（不动画） */
export function toLive() {
  if (view.pos === hist.length) return;
  env?.review(null);
  view.pos = hist.length;
}

function seal() {
  if (!env) return;
  hist.push({ L: snapshot(env.left), R: snapshot(env.right) });
  view.live = hist.length;
  view.pos = hist.length;
}

/** 等一个元素的尺寸停下来（兜底：书现在是固定大小，一般不会变），最多等 1.2 秒 */
async function settle(el) {
  let last = '';
  let same = 0;
  const t0 = performance.now();
  while (same < 4 && performance.now() - t0 < 1200) {
    await new Promise((r) => requestAnimationFrame(r));
    const k = `${el.offsetWidth}x${el.offsetHeight}`; // 布局尺寸（书在缩放、倾斜过的场景里，外接矩形不是页的 px 尺寸）
    same = k === last ? same + 1 : 0;
    last = k;
  }
}

/** 翻之前：给旧的两页拍快照，换上盖布，提交状态，等新页排好版，返回两面的内容 */
async function prepare(commit, dir) {
  const { shell } = env;
  const single = env.mobile();
  let page = { w: env.right.offsetWidth, h: env.right.offsetHeight };
  const oldR = snapshot(env.right);
  const oldL = single ? null : snapshot(env.left);
  flip.on = true;
  flip.dir = dir;
  announce(true);
  subs.forEach((f) => f('start', dir));
  env.snaps(dir > 0 ? oldL : null, dir > 0 ? null : oldR); // 向后翻：旧左页盖住新左页；向前翻：旧右页盖住新右页
  commit();
  await tick();
  await raf2(); // 新页排好版
  if (env?.ready) await env.ready();
  // 案升起或收起、书跟着缩放：先盖着旧页等它停下来，再翻（纸的大小要与最后的页一样大）
  if (Math.abs(env.right.offsetHeight - page.h) > 3 || Math.abs(env.right.offsetWidth - page.w) > 3) {
    env.snaps(single ? null : snapshot(oldL), snapshot(oldR));
    await settle(env.right);
    env.snaps(dir > 0 ? oldL : null, dir > 0 ? null : oldR);
    page = { w: env.right.offsetWidth, h: env.right.offsetHeight };
  }
  // 新的两页：向后翻时背面是新左页，向前翻时正面是新右页
  const newL = single ? null : snapshot(env.left);
  const newR = snapshot(env.right);
  return { shell, page, single, front: dir > 0 ? oldR : newR, back: dir > 0 ? newL : oldL };
}

function endFlip(dir) {
  env?.snaps(null, null);
  flip.on = false;
  announce(false);
  subs.forEach((f) => f('end', dir));
}

/**
 * 换屏或翻一页。commit() 同步改状态；返回的 Promise 在落定之后结束。
 *   dir     1 向后翻、-1 向前翻
 *   record  旧的这一对页要不要封存成写下的页（回看用）。默认要；屏用 Spread 的 record={false} 声明自己是空页
 *   review  true：只是回看（切换显示哪一对页），不封存、不跳回最新
 *   shut    true：不翻纸，书合拢一下再打开（重求签、重起卦、再灼；回卷首、再来一局），合拢时换内容
 * 减少动效、页面不可见、还没挂好时，不翻，直接提交。
 */
export async function turn(commit, { dir = 1, ms = PAGE_MS, record = true, review = false, shut = false } = {}) {
  if (!review) toLive();
  const sealIt = record && dir > 0 && !review && cur?.record !== false;
  if (shut && env) { // 重来：书合拢一下再打开，合拢时才换内容
    if (running) { running.finish(); running = null; }
    if (sealIt) seal();
    flip.on = true;
    announce(true);
    subs.forEach((f) => f('start', dir));
    await env.shut(commit);
    flip.on = false;
    announce(false);
    subs.forEach((f) => f('end', dir));
    return;
  }
  if (!env || env.reduced || document.hidden) {
    if (sealIt && env) seal();
    commit();
    return;
  }
  if (running) { running.finish(); running = null; } // 上一张还没落定：直接落定
  const id = ++seq;
  if (!env.right.offsetWidth) { if (sealIt) seal(); commit(); return; }
  if (sealIt) seal();

  const p = await prepare(commit, dir);
  if (id !== seq) return; // 期间又换了一页
  const frames = [];
  const job = playLeaf(p.shell, { front: p.front, back: p.back, page: p.page, dir, single: p.single, ms: p.single ? Math.round(ms * 0.7) : ms, onFrame: (t) => frames.push(t) });
  running = job;
  await job.done;
  if (id !== seq) return;
  if (running === job) running = null;
  if (frames.length > 2) flip.fps = Math.round((frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000));
  endFlip(dir);
}

/* ───────── 回看写下的页 ───────── */

/** 往 dir 的方向，在写下的页里翻一页（dir 1 往后，-1 往前）。返回是否翻了 */
export function stepHist(dir) {
  const to = view.pos + dir;
  if (to < 0 || to > hist.length || !env) return false;
  turn(() => { env.review(to === hist.length ? null : hist[to]); view.pos = to; }, { dir, review: true });
  return true;
}

/* ───────── 拖页角翻页 ───────── */

/**
 * 开始拖一页。commit() 先把新的一对页换到纸下面，revert() 在放弃（拖得不够就松手）时换回来。
 * 返回手柄 { ready: Promise, set(e), release(), e }；e 是纸翻开的程度，0 平放在右边，1 翻到左边（向前翻时从 1 往 0）。
 * 拖动时记下手的速度：纸边随速度落在后面（动态的卷曲）；松手时带着这个速度，过了中线就翻过去，没过就弹回（弹簧，见 flip.js）。
 */
export function beginDrag(commit, revert, dir) {
  if (!env || env.reduced || running) return null;
  const id = ++seq;
  let leaf = null;
  let want = dir > 0 ? 0 : 1;
  let lag = 0;
  const samples = []; // [时间, 翻过去的程度 p]，用来估计松手时的速度
  const pOf = (e) => (dir > 0 ? e : 1 - e);
  const velocity = () => {
    const now = performance.now();
    while (samples.length > 1 && now - samples[0][0] > 120) samples.shift();
    if (samples.length < 2) return 0;
    const [t0, p0] = samples[0];
    const [t1, p1] = samples[samples.length - 1];
    return t1 - t0 > 8 ? ((p1 - p0) / (t1 - t0)) * 1000 : 0;
  };
  let dead = false;
  const ready = (async () => {
    const p = await prepare(commit, dir);
    if (id !== seq || dead) { endFlip(dir); return false; }
    leaf = createLeaf(p.shell, { front: p.front, back: p.back, page: p.page, single: p.single });
    leaf.set(want, lag);
    return true;
  })();
  const handle = {
    ready,
    set(e, t = performance.now()) {
      want = Math.min(1, Math.max(0, e));
      samples.push([t, pOf(want)]);
      if (samples.length > 12) samples.shift();
      if (!leaf) return;
      const v = velocity();
      const dth = v * leaf.maxRot * (dir > 0 ? 1 : -1);
      lag += (clamp(-dth * 0.05, -22, 22) - lag) * 0.35; // 手动得快，纸边落在后面
      leaf.set(want, lag);
    },
    get e() { return want; },
    async release() {
      const ok = await ready;
      if (!ok) return;
      const p = pOf(want);
      const v = velocity();
      const complete = p + v * 0.16 > 0.5; // 过了中线，或者手是朝着翻过去的方向甩出去的
      const job = springTo(leaf, { from: p, to: complete ? 1 : 0, v0: v, dir, omega: 11, zeta: 0.62 });
      running = job;
      await job.done;
      if (running === job) running = null;
      if (!complete) revert();
      await tick();
      endFlip(dir);
    },
  };
  return handle;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 在最新的一页再往后翻：纸被拎起一点，露出还没写的空白，再弹回去并抖一下。dir 1：右页往后；-1：左页往前 */
export async function bounce(dir = 1) {
  if (!env || env.reduced || running || document.hidden) return;
  const { shell } = env;
  const single = env.mobile();
  if (single && dir < 0) return;
  const src = dir > 0 ? env.right : env.left;
  if (!src.offsetWidth) return;
  const page = { w: src.offsetWidth, h: src.offsetHeight };
  const blank = () => { const d = document.createElement('div'); d.className = 'pg-blank'; return d; };
  const front = snapshot(src);
  if (dir > 0) env.snaps(null, blank()); else env.snaps(blank(), null);
  const leaf = createLeaf(shell, dir > 0 ? { front, back: single ? null : blank(), page, single } : { front: blank(), back: front, page, single });
  // 从原处被拎起（初速度），弹簧把它拉回去：欠阻尼，落回去时碰一下再抖两下
  const job = springTo(leaf, { from: 0, to: 0, v0: single ? 1.5 : 1.25, omega: 21, zeta: 0.3, dir, maxMs: 1200 });
  running = job;
  await job.done;
  if (running === job) running = null;
  env?.snaps(null, null);
}

/* ───────── 往哪翻：点页、方向键、拖页角共用 ───────── */

/**
 * 往 dir 方向翻一页，能翻到哪里：
 *   往前（-1）：先退结局里的分页（pager），再退到写下的页；
 *   往后（+1）：回看中，往后一直到最新的一屏；在最新的一屏，只有结局里的分页还能往后。
 * 返回 null 表示翻不动（往后，书会抗拒；往前，已经是第一页）。否则返回 { commit, revert, step }：
 *   commit/revert  同步地换到新的一对页、换回来（拖页角时用）；step() 翻一页（带动画）
 */
export function target(dir) {
  const live = view.pos === hist.length;
  const p = live ? cur?.pager : null;
  if (p && dir > 0 && p.i < p.n - 1) {
    const i = p.i;
    return { commit: () => p.to(i + 1), revert: () => p.to(i), step: () => turn(() => p.to(i + 1), { dir, record: false }) };
  }
  if (p && dir < 0 && p.i > 0) {
    const i = p.i;
    return { commit: () => p.to(i - 1), revert: () => p.to(i), step: () => turn(() => p.to(i - 1), { dir, record: false }) };
  }
  const from = view.pos;
  const to = from + dir;
  if (to < 0 || to > hist.length || !env) return null;
  const show = (k) => { env.review(k === hist.length ? null : hist[k]); view.pos = k; };
  return { commit: () => show(to), revert: () => show(from), step: () => stepHist(dir) };
}

/** 点页或方向键：能翻就翻，翻不动就抗拒。返回是否翻了 */
export function nav(dir) {
  if (flip.on || running) return false;
  const t = target(dir);
  if (!t) { if (dir > 0) env?.resist?.(); bounce(dir); return false; }
  t.step();
  return true;
}
