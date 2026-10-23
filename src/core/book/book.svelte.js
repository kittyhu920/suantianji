// 书：当前这一屏（spread）的登记，与翻页的编排（docs/DESIGN.md §19）。
//
// 每一屏是一个“对页”：左页是大师的页（天头眉批、这一步的名字、页边的注），右页是玩家的页（器物与内容）。
// 屏里用 <Spread> 登记这一对页的信息（名字、说明、左页的内容、页脚的按钮），Ritual 把它们排进书与页脚。
// 换屏时 turn(commit, { dir }) 负责：先给旧的两页拍快照，提交状态，再把右页翻过去。

import { tick } from 'svelte';
import { snapshot, playLeaf } from './flip.js';

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

let env = null; // { shell, right, left, mobile(), reduced, onStart(dir), onEnd() }
let running = null;
let seq = 0;
const subs = new Set();

export function attachBook(e) {
  env = e;
  return () => { env = null; running?.finish(); running = null; };
}

/** 翻页前后要做的事（眉批、注暂缓）：返回取消函数 */
export function onFlip(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

const PAGE_MS = 1100;
const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * 翻一页。commit() 同步改状态（换屏或换分页）；返回的 Promise 在落定之后结束。
 * 减少动效、页面不可见、还没挂好时，不翻，直接提交。
 */
export async function turn(commit, { dir = 1, ms = PAGE_MS } = {}) {
  if (!env || env.reduced || document.hidden) { commit(); return; }
  if (running) { running.finish(); running = null; } // 上一张还没落定：直接落定
  const id = ++seq;
  const { shell, right, left } = env;
  const single = env.mobile();
  const rect = right.getBoundingClientRect();
  if (!rect.width) { commit(); return; }
  const page = { w: Math.round(rect.width), h: Math.round(rect.height) };

  // 旧的两页
  const oldR = snapshot(right);
  const oldL = single ? null : snapshot(left);

  flip.on = true;
  flip.dir = dir;
  subs.forEach((f) => f('start', dir));
  env.snaps(dir > 0 ? oldL : null, dir > 0 ? null : oldR); // 向后翻：旧左页盖住新左页；向前翻：旧右页盖住新右页

  commit();
  await tick();
  await raf2(); // 新页排好版
  if (id !== seq) return; // 期间又换了一页

  // 新的两页：向后翻时背面是新左页，向前翻时正面是新右页
  const newL = single ? null : snapshot(left);
  const newR = snapshot(right);
  const front = dir > 0 ? oldR : newR;
  const back = dir > 0 ? newL : oldL;

  const frames = [];
  const job = playLeaf(shell, { front, back, page, dir, single, ms: single ? Math.round(ms * 0.7) : ms, onFrame: (t) => frames.push(t) });
  running = job;
  await job.done;
  if (id !== seq) return;
  if (running === job) running = null;
  if (frames.length > 2) flip.fps = Math.round((frames.length - 1) / ((frames[frames.length - 1] - frames[0]) / 1000));
  env?.snaps(null, null);
  flip.on = false;
  subs.forEach((f) => f('end', dir));
}
