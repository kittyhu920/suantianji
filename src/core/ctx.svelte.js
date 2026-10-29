// 卷的运行环境 ctx：公共层交给每一卷的一套工具。
//
//   screen / show(name,{shut,reset,onCommit})  当前屏与换屏。shut:true 是"重来"：书合着，封面掀一下再落回；
//                            reset:true 是回卷首、再来一局：同样掀一下，并换一册新书。onCommit 在换屏的那一刻同步执行
//   turn(commit,{shut})      不换屏、只改状态（例如签落了）：commit() 里改状态
//   gloss(text, {alarm,key}) 书说一句话：字迹写在翻开着的扉页上，说完渗进纸里；clearGloss() 清空
//   thud()                   结局时，书沉一下
//   sfx                      声音（audio.js 的全部导出）
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

import { createGloss } from './gloss.js';
import { tear, tremble, thud, riffle } from './book/fx.js';
import { stage } from './book/stage.svelte.js';
import { store, daysAgo } from './store.js';
import { hashString } from './rng.js';
import * as sfx from './audio.js';
import * as profile from './profile.js';

export function createCtx(juan) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

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
    birth: null,
    ledger: { seed: (data) => hashString(JSON.stringify(data)) % 4294967296 },
    voice: null,
    lastActive: performance.now(),
    idleFlagged: false,
    prevScreen: null,

    get screen() { return ui.screen; },
    get shownCount() { return ui.n; }, // 每换一次屏加一，用作 {#key}，同名屏重新进入也会重建

    sleep: (ms) => new Promise((r) => setTimeout(r, reduced ? Math.min(ms, 60) : ms)),
    sec: (ms) => (ms / 1000).toFixed(1),

    gloss(text, opts) { glossEngine?.push(text, opts); },
    clearGloss() { glossEngine?.clear(); },

    // onCommit：换屏的那一刻同步执行，卷用它重置自己的状态
    show(name, { shut = false, reset = false, onCommit } = {}) {
      ctx.prevScreen = ui.screen;
      ctx.touch();
      if (shut || reset) {
        if (shut && !reset) ctx.gloss('我合上这一页，再翻开一页新的', { key: 'shut' });
        riffle();
      }
      onCommit?.();
      ui.screen = name;
      ui.n += 1;
      return Promise.resolve();
    },

    turn(commit, opts) {
      ctx.touch();
      if (opts?.shut) {
        ctx.gloss('我合上这一页，再翻开一页新的', { key: 'shut' });
        riffle();
      }
      commit();
      return Promise.resolve();
    },

    thud,

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
      ctx.gloss('不信我，就按左下角那个“存疑”');
    },

    doubtVisible(game) {
      return round.doubtShown && !round.doubted && !round.finished && !!game.canDoubt?.();
    },

    // 按下存疑印：画心撕开一瞬，收尾后交给卷的 finish()
    async pressDoubt(game) {
      if (round.finished) return;
      round.doubted = true;
      ctx.gloss('你打断了我', { alarm: true });
      ctx.gloss('你不想被我算');
      sfx.bronze(220, 2.6, 0.16);
      await Promise.all([tear(), ctx.sleep(600)]); // 封面被撕开一道
      game.finish();
    },

    // 发呆（静止八秒）与离开页面的计数。卷只需实现 game.canDoubt()（现在是否在仪式中）与可选的 game.busy()
    watch(game) {
      const iv = setInterval(() => {
        if (round.finished || ctx.idleFlagged || game.busy?.() || !game.canDoubt?.()) return;
        if (performance.now() - ctx.lastActive > 8000) {
          ctx.idleFlagged = true;
          round.idle++;
          tremble(); // 书轻轻颤一下
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

    // 书说话的地方（扉页上的 .voice）由 Codex 交进来；书说话的状态记在 stage.speaking
    attach({ voice }) {
      glossEngine = createGloss(voice, { reduced, onState: (on) => { stage.speaking = on; }, onSay: (t) => { stage.said = t; stage.saidN++; } });
      ctx.voice = glossEngine;

      const touchEv = ['pointerdown', 'keydown', 'input'];
      const onTouch = () => ctx.touch();
      touchEv.forEach((t) => document.addEventListener(t, onTouch, { passive: true }));
      cleanups.push(() => touchEv.forEach((t) => document.removeEventListener(t, onTouch)));
    },

    destroy() {
      cleanups.forEach((f) => f());
      cleanups = [];
      glossEngine?.clear();
      stage.speaking = false;
    },
  };
  return ctx;
}
