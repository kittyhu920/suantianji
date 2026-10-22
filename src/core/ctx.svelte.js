// 卷的运行环境 ctx：公共层交给每一卷的一套工具。
//
//   screen / show(name)      当前屏与换屏（换屏时新的一屏从指尖落下的地方洇开）
//   gloss(text, {alarm,key}) 写一条眉批；clearGloss() 清空
//   sfx                      声音（audio.js 的全部导出）
//   fx / fxPoint(el,ax,ay)   墨与水的画布，与把某元素上的一点换算成画布坐标
//   reduced / coarse         减少动效、触屏
//   sleep / sec              延时（减少动效下压到 60ms 以内）、毫秒换秒
//   store / daysAgo          本地存储
//   touch() / lastActive     "玩家刚刚动过"的记号，发呆（静止八秒）由此判断
//   profile                  观人术（profile.js）
//   ledger.seed(data)        行为账本 → 命盘种子
//   birth                    生辰档案（之后的批次接入，现为 null）
//   zhu                      注疏（术语出现时注栏同步出注）
//   el                       { huaxin, stage }：画心与可滚动的舞台

import { createInk } from './ink.js';
import { createGloss } from './gloss.js';
import { revealScreen } from './reveal.js';
import { store, daysAgo } from './store.js';
import { hashString } from './rng.js';
import * as sfx from './audio.js';
import * as profile from './profile.js';
import * as zhu from './zhu.svelte.js';

export function createCtx(juan) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const canReveal = !reduced && !!window.CSS?.registerProperty;
  const debug = location.search.includes('debug');

  const ui = $state({ screen: juan.start ?? 'title', n: 0 });
  let glossEngine = null;
  let cleanups = [];

  const ctx = {
    juan,
    reduced,
    coarse,
    sfx,
    store,
    daysAgo,
    profile,
    zhu,
    birth: null,
    ledger: { seed: (data) => hashString(JSON.stringify(data)) % 4294967296 },
    el: { huaxin: null, stage: null },
    fx: createInk({}, { reduced: true }), // attach 之前先用空实现，免得提前调用时出错
    lastTap: null,
    lastActive: performance.now(),
    idleFlagged: false,
    prevScreen: null,

    get screen() { return ui.screen; },
    get shownCount() { return ui.n; }, // 每换一次屏加一，用作 {#key}，同名屏重新进入也会重建

    sleep: (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 60) : ms)),
    sec: (ms) => (ms / 1000).toFixed(1),

    gloss(text, opts) { glossEngine?.push(text, opts); },
    clearGloss() { glossEngine?.clear(); },

    // 某个元素上的一点，换算成墨画布里的坐标
    fxPoint(el, ax = 0.5, ay = 0.5) {
      const c = ctx.el.huaxin.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - c.left + r.width * ax, y: r.top - c.top + r.height * ay };
    },

    show(name) {
      ctx.prevScreen = ui.screen;
      ui.screen = name;
      ui.n += 1;
      ctx.touch();
    },

    touch() {
      ctx.lastActive = performance.now();
      ctx.idleFlagged = false;
    },

    /** 新的一屏挂上之后调用：滚回顶部，必要时从指尖处洇开 */
    afterShow() {
      const { stage } = ctx.el;
      if (!stage) return;
      stage.scrollTop = 0;
      const next = stage.querySelector('.screen');
      if (canReveal && next && ctx.prevScreen != null && ctx.prevScreen !== ui.screen) revealScreen(ctx, next);
    },

    attach({ huaxin, stage, canvas, glossHost }) {
      ctx.el.huaxin = huaxin;
      ctx.el.stage = stage;
      ctx.fx = createInk(canvas, { reduced });
      if (debug) window.__fx = ctx.fx; // 调试：手动触发墨与水
      glossEngine = createGloss(glossHost, { reduced });

      // 指尖落在纸上：一小团墨晕、两圈水纹
      const onDown = (e) => {
        const c = canvas.getBoundingClientRect();
        const x = e.clientX - c.left;
        const y = e.clientY - c.top;
        ctx.lastTap = { x, y, t: performance.now() };
        // 签筒上手指一直在动、红色按钮自己就有按下的反馈，都不再落墨
        if (e.target.closest?.('.tube, .seal, .btn-primary')) return;
        ctx.fx.splash(x, y);
      };
      huaxin.addEventListener('pointerdown', onDown, { passive: true });
      cleanups.push(() => huaxin.removeEventListener('pointerdown', onDown));

      const touchEv = ['pointerdown', 'keydown', 'input'];
      const onTouch = () => ctx.touch();
      touchEv.forEach((t) => document.addEventListener(t, onTouch, { passive: true }));
      cleanups.push(() => touchEv.forEach((t) => document.removeEventListener(t, onTouch)));
    },

    destroy() {
      cleanups.forEach((f) => f());
      cleanups = [];
      ctx.fx.destroy();
      glossEngine?.clear();
    },
  };
  return ctx;
}
