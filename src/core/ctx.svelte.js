// 卷的运行环境 ctx：公共层交给每一卷的一套工具。
//
//   screen / show(name,{dir})  当前屏与换屏（换屏就是翻一页：dir 1 向后翻，-1 向前翻回去）
//   turn(commit,{dir})       不换屏、只翻一页（例如结局的分页）：commit() 里改状态
//   gloss(text, {alarm,key}) 写一条眉批；clearGloss() 清空
//   sfx                      声音（audio.js 的全部导出）
//   fx / fxPoint(el,ax,ay)   墨与水的画布，与把某元素上的一点换算成画布坐标
//   reduced / coarse         减少动效、触屏
//   sleep / sec              延时（减少动效下压到 60ms 以内）、毫秒换秒
//   store / storeAll         本卷的本地存储命名空间（get/set）、与跨卷的 store（store.getJuan 读别的卷）
//   visits / memory / endings  来访次数、“大师记得你”的上一局记录、已得的结局（都存在本卷命名空间里）
//   copy                     本卷提供的、公共组件要显示的文案（通灵、分享图），见 src/juan/index.js
//   round                    一局里公共层替你数的东西：idle（发呆次数）、hidden（离开页面次数）、
//                            doubtShown / doubted（存疑印是否出现、是否被按下）、finished、id（局号）
//   resetRound() / revealDoubt() / watch(game) / pressDoubt(game)  发呆与离开页面的计数、存疑印的出现与收尾
//   touch() / lastActive     "玩家刚刚动过"的记号，发呆（静止八秒）由此判断
//   profile                  观人术（profile.js）
//   ledger.seed(data)        行为账本 → 命盘种子
//   birth                    生辰档案（之后接入，现为 null）
//   zhu                      注疏（术语出现时注栏同步出注）
//   el                       { huaxin, stage }：画心与可滚动的舞台

import { createInk } from './ink.js';
import { createGloss } from './gloss.js';
import { turn, onFlip } from './book/book.svelte.js';
import { store, daysAgo } from './store.js';
import { hashString } from './rng.js';
import * as sfx from './audio.js';
import * as profile from './profile.js';
import * as zhu from './zhu.svelte.js';
import { holdZhu, clearShown } from './zhu.svelte.js';

export function createCtx(juan) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const debug = location.search.includes('debug');

  const ui = $state({ screen: juan.start ?? 'title', n: 0 });
  const round = $state({ idle: 0, hidden: 0, doubtShown: false, doubted: false, finished: false, id: 0 });
  const ns = store.juan(juan.id);
  let glossEngine = null;
  let cleanups = [];

  const ctx = {
    juan,
    reduced,
    coarse,
    sfx,
    store: ns,
    storeAll: store,
    daysAgo,
    copy: juan.copy ?? {},
    round,
    visits: {
      get: () => ns.get('visits', 0),
      bump() { const n = ns.get('visits', 0) + 1; ns.set('visits', n); return n; },
    },
    memory: { get: () => ns.get('last', null), set: (r) => ns.set('last', r) },
    endings: {
      get: () => ns.get('endings', []),
      record(key) {
        const got = new Set(ns.get('endings', []));
        got.add(key);
        ns.set('endings', [...got]);
        return [...got];
      },
    },
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

    show(name, { dir = 1 } = {}) {
      ctx.prevScreen = ui.screen;
      ctx.touch();
      return turn(() => { clearShown(); ui.screen = name; ui.n += 1; }, { dir });
    },

    turn(commit, opts) {
      ctx.touch();
      return turn(() => { clearShown(); commit(); }, opts);
    },

    touch() {
      ctx.lastActive = performance.now();
      ctx.idleFlagged = false;
    },

    /* ───────── 一局里的观测：发呆、离开页面、存疑印 ───────── */
    // 新的一局：计数清零，局号加一（通灵等迟到的回复据此判断是不是上一局的）
    resetRound() {
      Object.assign(round, { idle: 0, hidden: 0, doubtShown: false, doubted: false, finished: false, id: round.id + 1 });
    },

    // 存疑印出现（只出现一次）。各卷在“玩家不认答案”的时刻调用
    revealDoubt() {
      if (round.doubtShown) return;
      round.doubtShown = true;
      ctx.gloss('不信我，就按左下角那枚印');
    },

    doubtVisible(game) {
      return round.doubtShown && !round.doubted && !round.finished && !!game.canDoubt?.();
    },

    // 按下存疑印：画心撕开一瞬，收尾后交给卷的 finish()
    async pressDoubt(game) {
      if (round.finished) return;
      round.doubted = true;
      ctx.el.huaxin.classList.add('is-broken');
      ctx.gloss('你打断了我', { alarm: true });
      ctx.gloss('你不想被我算');
      sfx.bronze(220, 2.6, 0.16);
      await ctx.sleep(1600);
      ctx.el.huaxin.classList.remove('is-broken');
      game.finish();
    },

    // 发呆（静止八秒）与离开页面的计数。卷只需实现 game.canDoubt()（现在是否在仪式中）与可选的 game.busy()
    watch(game) {
      const iv = setInterval(() => {
        if (round.finished || ctx.idleFlagged || game.busy?.() || !game.canDoubt?.()) return;
        if (performance.now() - ctx.lastActive > 8000) {
          ctx.idleFlagged = true;
          round.idle++;
          ctx.gloss('你停了八秒，我记为犹豫');
          ctx.revealDoubt();
        }
      }, 1000);
      const onVisible = () => {
        if (round.finished || !game.canDoubt?.()) return;
        if (document.visibilityState === 'visible') {
          round.hidden++;
          ctx.gloss('你走开了一会儿，我记下了');
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      cleanups.push(() => { clearInterval(iv); document.removeEventListener('visibilitychange', onVisible); });
    },

    /** 新的一屏挂上之后调用：滚回顶部 */
    afterShow() {
      const { stage } = ctx.el;
      if (stage) stage.scrollTop = 0;
    },

    attach({ huaxin, stage, canvas, glossHost }) {
      ctx.el.huaxin = huaxin;
      ctx.el.stage = stage;
      ctx.fx = createInk(canvas, { reduced });
      if (debug) window.__fx = ctx.fx; // 调试：手动触发墨与水
      glossEngine = createGloss(glossHost, { reduced });

      // 翻页时，眉批与注先不写，落定之后再写（正在写的那条接着在新的一页上重写）
      let release = null;
      cleanups.push(onFlip((ev) => {
        if (ev === 'start') {
          glossEngine.hold(new Promise((r) => { release = r; }));
          holdZhu(true);
        } else {
          release?.();
          holdZhu(false);
        }
      }));

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
