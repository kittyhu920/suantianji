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
import { snapshot, playLeaf, createLeaf, animateLeaf } from './flip.js';

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

/** 等一个元素的尺寸停下来（案升起、书缩小的过渡），最多等 1.2 秒 */
async function settle(el) {
  let last = '';
  let same = 0;
  const t0 = performance.now();
  while (same < 4 && performance.now() - t0 < 1200) {
    await new Promise((r) => requestAnimationFrame(r));
    const r = el.getBoundingClientRect();
    const k = `${Math.round(r.width)}x${Math.round(r.height)}`;
    same = k === last ? same + 1 : 0;
    last = k;
  }
}

/** 翻之前：给旧的两页拍快照，换上盖布，提交状态，等新页排好版，返回两面的内容 */
async function prepare(commit, dir) {
  const { shell } = env;
  const single = env.mobile();
  const rect = env.right.getBoundingClientRect();
  let page = { w: Math.round(rect.width), h: Math.round(rect.height) };
  const oldR = snapshot(env.right);
  const oldL = single ? null : snapshot(env.left);
  flip.on = true;
  flip.dir = dir;
  subs.forEach((f) => f('start', dir));
  env.snaps(dir > 0 ? oldL : null, dir > 0 ? null : oldR); // 向后翻：旧左页盖住新左页；向前翻：旧右页盖住新右页
  commit();
  await tick();
  await raf2(); // 新页排好版
  if (env?.ready) await env.ready();
  // 案升起或收起、书跟着缩放：先盖着旧页等它停下来，再翻（纸的大小要与最后的页一样大）
  const now = env.right.getBoundingClientRect();
  if (Math.abs(now.height - page.h) > 3 || Math.abs(now.width - page.w) > 3) {
    env.snaps(single ? null : snapshot(oldL), snapshot(oldR));
    await settle(env.right);
    env.snaps(dir > 0 ? oldL : null, dir > 0 ? null : oldR);
    const r2 = env.right.getBoundingClientRect();
    page = { w: Math.round(r2.width), h: Math.round(r2.height) };
  }
  // 新的两页：向后翻时背面是新左页，向前翻时正面是新右页
  const newL = single ? null : snapshot(env.left);
  const newR = snapshot(env.right);
  return { shell, page, single, front: dir > 0 ? oldR : newR, back: dir > 0 ? newL : oldL };
}

function endFlip(dir) {
  env?.snaps(null, null);
  flip.on = false;
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
    subs.forEach((f) => f('start', dir));
    await env.shut(commit);
    flip.on = false;
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
  const rect = env.right.getBoundingClientRect();
  if (!rect.width) { if (sealIt) seal(); commit(); return; }
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
 * 返回手柄 { ready: Promise, set(e), release(complete, v), cancel() }；e 是纸翻开的程度，0 平放在右边，1 翻到左边（向前翻时从 1 往 0）。
 */
export function beginDrag(commit, revert, dir) {
  if (!env || env.reduced || running) return null;
  const id = ++seq;
  let leaf = null;
  let want = dir > 0 ? 0 : 1;
  let dead = false;
  const ready = (async () => {
    const p = await prepare(commit, dir);
    if (id !== seq || dead) { endFlip(dir); return false; }
    leaf = createLeaf(p.shell, { front: p.front, back: p.back, page: p.page, single: p.single });
    leaf.set(want);
    return true;
  })();
  const handle = {
    ready,
    set(e) { want = Math.min(1, Math.max(0, e)); leaf?.set(want); },
    get e() { return want; },
    async release(complete) {
      const ok = await ready;
      if (!ok) return;
      const to = complete ? (dir > 0 ? 1 : 0) : (dir > 0 ? 0 : 1);
      const ms = Math.round(520 * Math.max(0.35, Math.abs(to - want)));
      const job = animateLeaf(leaf, want, to, ms);
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

/** 在最新的一页再往后翻：纸被拎起一点，露出还没写的空白，再弹回去。dir 1：右页往后；-1：左页往前 */
export async function bounce(dir = 1) {
  if (!env || env.reduced || running || document.hidden) return;
  const { shell } = env;
  const single = env.mobile();
  if (single && dir < 0) return;
  const src = dir > 0 ? env.right : env.left;
  const rect = src.getBoundingClientRect();
  if (!rect.width) return;
  const page = { w: Math.round(rect.width), h: Math.round(rect.height) };
  const blank = () => { const d = document.createElement('div'); d.className = 'pg-blank'; return d; };
  const front = snapshot(src);
  if (dir > 0) env.snaps(null, blank()); else env.snaps(blank(), null);
  const leaf = createLeaf(shell, dir > 0 ? { front, back: single ? null : blank(), page, single } : { front: blank(), back: front, page, single });
  const peak = single ? 0.22 : 0.15;
  const base = dir > 0 ? 0 : 1;
  const sgn = dir > 0 ? 1 : -1;
  const wrap = { set: (v) => leaf.set(base + sgn * Math.max(0, v)), remove: () => leaf.remove() };
  const job = animateLeaf(wrap, 0, peak, 260, { keep: true });
  running = job;
  await job.done;
  const back = animateLeaf(wrap, peak, 0, 520, { easing: (t) => 1 - (1 - t) ** 3 * Math.cos(t * 7) });
  running = back;
  await back.done;
  if (running === back) running = null;
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
