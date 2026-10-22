// 签卷的一局：定盘 → 摇签 → 掷筊 → 结局。逻辑原样搬自旧版 main.js，只是显示交给各屏的 Svelte 组件。
// 公共层（眉批、墨与水、注疏、通灵、分享图、命盘）由 ctx 提供，见 src/core/ctx.svelte.js。

import db from './fortune-db.json';
import { castJiao, CUP_NAMES, CUP_SHORT, CUP_LABELS } from './jiao.js';
import { createQian } from './tube.js';
import { trueRandom } from '../../core/rng.js';
import { readSure, questionMood } from '../../core/profile.js';
import { readDisappoint, readPortrait, ledgerNotes } from './profile.js';
import { createShake } from '../../core/shake.svelte.js';
import { consultOracle, resetOracle } from '../../core/oracle.svelte.js';
import { drawPoster } from '../../core/poster.js';
import { posterSpec } from './poster.js';
import { finishRound } from '../../core/round.js';
import { ATTITUDE } from '../../core/ending.js';

export { db, CUP_NAMES, CUP_LABELS };

// 0–69 的中文数字：十一、二十、六十……
const DIGITS = '零一二三四五六七八九';
export const CN_NUM = Array.from({ length: 70 }, (_, n) => (n < 10 ? DIGITS[n]
  : `${n >= 20 ? DIGITS[Math.floor(n / 10)] : ''}十${n % 10 ? DIGITS[n % 10] : ''}`));

// 签头（no 为 0）不属干支，显示为"签头"
export const signNo = (sign) => (sign.no ? `第${CN_NUM[sign.no]}签` : '签头');
export const signFull = (sign) => [signNo(sign), sign.gz, sign.nayin].filter(Boolean).join(' · ');

const RITUAL = ['ding', 'qian', 'jiao'];

function freshState() {
  const now = new Date();
  return {
    t0: performance.now(),
    clock: now,
    branchIdx: Math.floor(((now.getHours() + 1) % 24) / 2), // 23:00 起为子时
    domain: null,
    question: '',
    sign: null,
    signShown: false, // 签已落地、签卡已出
    cups: [],
    throws: [],
    pending: null,
    draws: 0, // 一共摇出了几支签（重求一次加一）
    insist: false, // 阴杯时选了"我偏要这支"
    dingEnterAt: 0,
    pickMs: null,
    shakeMs: 0,
    shakeTries: 0,
    hesitations: [],
    readyAt: 0,
    oracleSent: false,
    reads: {}, // 旁批里报出的数字及其来由：sure / disappoint，结局时坦白怎么算的
    aiShi: [], // 通灵返回的"实话"
    portrait: null,
    prevVisit: null, // 这一局之前的那一次
    end: null, // 结局时一次算好的东西
    // 掷筊屏
    jiao: { note: '', result: null, labels: ['', ''], mode: 'throw', again: false, busy: false, accept: '', reroll: '', focus: 0 },
  };
}

export function createGame(ctx) {
  const { gloss, sec, sleep, sfx } = ctx;
  const S = $state(freshState());
  const ui = $state({ posterOpen: false });
  let lastVisit = ctx.memory.get(); // 上一局的记录，只存在玩家本机
  let tube = null;
  let tossFn = null; // 掷筊屏挂上来的"筊在空中翻转"
  let fin = null; // 收尾时算好的：整局用时、画像、签是否算数

  // 观人术要读的行为状态：本局的状态，加上公共层替我们数的发呆、离开页面与存疑
  const view = () => ({ ...S, idle: ctx.round.idle, hidden: ctx.round.hidden, doubt: ctx.round.doubted });

  const branch = () => db.branches[S.branchIdx];

  /* ───────── 摇动控制（公共层） ───────── */
  const shake = createShake(ctx, {
    tube: () => tube,
    active: () => ctx.screen === 'qian' && !S.sign,
    onTry: () => { S.shakeTries += 1; },
  });

  /* ───────── 入卷 ───────── */
  function daysAgoText(iso) { return ctx.daysAgo(iso); }

  // 来访次数按"真的开始求签"计，刷新页面不算
  function bootTitle() {
    const visits = ctx.visits.get() + 1;
    gloss('我开始留意你了');
    gloss(`你用的是${ctx.coarse ? '手机' : '电脑'}`);
    if (visits > 1) gloss(`你第 ${visits} 次来找我了`);
    if (lastVisit) gloss(`${daysAgoText(lastVisit.at)}你抽到的是${lastVisit.name}`);
  }

  function begin() {
    shake.requestMotion(); // iOS 只允许在点击里申请"动作与方向"权限，所以在这里就申请，摇签时才能直接晃
    ctx.visits.bump();
    sfx.initAudio();
    sfx.startDrone();
    sfx.bronze(330, 2.2, 0.14);
    enterDing();
  }

  /* ───────── 定盘 ───────── */
  function enterDing() {
    ctx.show('ding');
    S.dingEnterAt = performance.now();
    const { zhi } = branch();
    const hh = String(S.clock.getHours()).padStart(2, '0');
    const mm = String(S.clock.getMinutes()).padStart(2, '0');
    gloss(`我看了你的时间：${zhi}时 ${hh}:${mm}`);
    gloss('我按时辰动了签筒的概率');
  }

  function pickDomain(key) {
    sfx.clack(0.6);
    const changed = S.domain !== key;
    S.domain = key;
    if (S.pickMs == null) S.pickMs = performance.now() - S.dingEnterAt;
    const d = db.domains[key];
    if (changed) gloss(`你问${d.name}，想了 ${sec(S.pickMs)} 秒。${d.persona}`, { key: 'pick' });
  }

  function confirmDing(question) {
    S.question = question.trim().slice(0, 40);
    if (S.question) gloss(`你写了 ${[...S.question].length} 个字，我读出了${questionMood(S.question)}`);
    sfx.bronze(392, 1.6, 0.12);
    enterQian();
  }

  /* ───────── 摇签：仿真签筒 ───────── */
  function enterQian() {
    ctx.show('qian');
    S.signShown = false;
  }

  // 摇签屏挂上时创建签筒；离开时停掉
  function attachTube(svg) {
    tube = createQian(svg, {
      sfx,
      reduced: ctx.reduced,
      onRelease: () => {
        const sign = pickSign();
        S.sign = sign;
        S.draws += 1;
        return signNo(sign);
      },
      onLanded: ({ activeMs }) => {
        S.shakeMs = activeMs;
        signLanded();
      },
    });
    if (location.search.includes('debug')) window.__qian = tube; // 调试：面板隐藏时 rAF 暂停，可手动 step()
    tube.start();
    return () => { tube?.stop(); shake.holdEnd(); tube = null; };
  }

  function pickSign() {
    const el = branch().el;
    const weights = db.signs.map((s) => (s.el === el ? 2 : 1));
    let r = trueRandom() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < db.signs.length; i++) {
      r -= weights[i];
      if (r <= 0) return db.signs[i];
    }
    return db.signs[db.signs.length - 1];
  }

  function signLanded() {
    if (ctx.screen !== 'qian' || !S.sign) return; // 玩家已回卷首
    const sign = S.sign;
    tube?.stop();
    gloss(`你摇了 ${sec(S.shakeMs)} 秒，试了 ${S.shakeTries} 次`);
    S.signShown = true;
    setTimeout(() => { // 签名落下的一刻：水纹与溅点
      if (ctx.screen !== 'qian') return;
      const name = document.getElementById('sign-name');
      if (!name) return;
      const p = ctx.fxPoint(name);
      ctx.fx.wash(p.x, p.y, { R: 110, a: 0.1, grow: 1.0, hold: 0.2, fade: 1.4 });
      ctx.fx.ripple(p.x, p.y, { r: 90, rings: 2, a: 0.2 });
    }, 480);
    const d = readDisappoint(view(), sign, lastVisit, db.signs);
    S.reads.disappoint = d;
    gloss(`${sign.level}签，我猜你 ${d.pct}% 会失望`, { alarm: d.pct > 60 });
    if (lastVisit?.name === sign.name) gloss('又是这支签。我记得');
    if (sign.el === branch().el) gloss(`这支签属${sign.el}，我替你加过分`);
  }

  /* ───────── 掷筊 ───────── */
  function registerToss(fn) { tossFn = fn; return () => { tossFn = null; }; }

  function enterJiao() {
    ctx.show('jiao');
    S.cups = [];
    S.pending = null;
    Object.assign(S.jiao, { labels: ['', ''], result: null, mode: 'throw', again: false, busy: false, note: '三杯都由你亲手掷。连得三个圣杯，这支签才算数。' });
    if (!S.reads.sure) {
      const r = readSure(view());
      S.reads.sure = r;
      gloss(`我有 ${r.pct}% 的把握猜中你`);
    }
    readyToThrow();
  }

  function setChoice(accept, reroll) {
    S.jiao.mode = 'choose';
    S.jiao.accept = accept;
    S.jiao.reroll = reroll;
    S.jiao.busy = false;
    S.readyAt = performance.now();
  }

  function readyToThrow({ again = false } = {}) {
    S.readyAt = performance.now();
    ctx.touch();
    Object.assign(S.jiao, { mode: 'throw', again, busy: false });
    S.jiao.focus += 1;
  }

  // again：笑杯之后按规矩再掷，不另计犹豫
  async function playerThrow() {
    const again = S.pending?.kind === 'xiao';
    const idx = S.cups.length;
    if (!again) {
      S.jiao.labels = ['', ''];
      const h = performance.now() - S.readyAt;
      S.hesitations.push(h);
      gloss(`${CUP_LABELS[idx]}，你犹豫了 ${sec(h)} 秒`);
    }
    ctx.touch();
    S.jiao.busy = true;
    const cup = castJiao();
    S.pending = cup;
    await tossFn?.(cup);
    if (ctx.screen !== 'jiao') return;
    S.jiao.labels = cup.flat.map((f) => (f ? '平面朝上' : '凸面朝上'));
    S.throws.push({ kind: cup.kind, cup: idx, draw: S.draws, kept: true });
    S.jiao.result = { idx, kind: cup.kind };
    if (cup.kind === 'xiao') {
      readyToThrow({ again: true });
      return;
    }
    S.cups.push({ ...cup });
    S.pending = null;
    if (cup.kind === 'yin') {
      gloss('阴杯，和我猜的不一样', { alarm: true });
      S.jiao.note = '神明不同意这支签。按规矩，要回去重新求一支。';
      setChoice('我偏要这支', '依规矩，重求一签');
      return;
    }
    if (S.cups.length < 3) {
      await sleep(500);
      if (ctx.screen === 'jiao') readyToThrow();
      return;
    }
    S.jiao.note = '三个圣杯，这支签算数了。';
    setChoice('受签', '不认这支签，重求');
  }

  // 左边的按钮：阴杯时是"我偏要这支"，三个圣杯时是"受签"
  function accept() {
    ctx.touch();
    if (S.cups.some((c) => c.kind === 'yin')) {
      S.insist = true;
      gloss('你偏要这支', { alarm: true });
    }
    finish();
  }

  // 右边的按钮：重求一签。前面的签作废，它们的掷筊记录在命盘里变淡
  function reroll() {
    ctx.touch();
    const n = S.draws;
    gloss(`你不认，重求一签 ×${n}`, { alarm: true });
    if (n === 2) gloss('我越来越懂你了……');
    ctx.revealDoubt();
    S.throws.forEach((t) => { t.kept = false; });
    S.sign = null;
    S.cups = [];
    S.pending = null;
    S.reads.disappoint = null;
    enterQian();
  }

  /* ───────── 结局 ───────── */
  // 四态结局的映射：破 > 迷 > 逆 > 遵（公共层只认这四个键）
  function attitude() {
    if (ctx.round.doubted) return ATTITUDE.po; // 不信这一套：按了存疑
    if (S.draws >= 3) return ATTITUDE.mi; // 求到第三支签：不停地刷，想要一个更好的答案
    if (S.insist) return ATTITUDE.ni; // 神明说不，你偏要这支
    return ATTITUDE.zun;
  }

  // 这支签作不作数
  function signState() {
    if (S.cups.some((c) => c.kind === 'yin')) return { key: 'no', text: S.insist ? '掷出了阴杯，神明不同意；是你偏要这支。' : '掷出了阴杯：神明不同意，这支签只能当参考。' };
    if (S.cups.length === 3) return { key: 'yes', text: '三次都是圣杯：这支签算数。' };
    return { key: 'open', text: S.cups.length ? `你在${CUP_LABELS[S.cups.length]}前停下了，这支签还没定。` : '还没掷筊，这支签还没定。' };
  }

  // 每一支签、每一杯的全部掷法，例如"第一支：圣 / 阴；第二支：圣 / 笑→圣 / 圣"
  function cupsRecord() {
    const draws = [...new Set(S.throws.map((t) => t.draw))];
    const one = (d) => [0, 1, 2]
      .map((i) => S.throws.filter((t) => t.draw === d && t.cup === i).map((t) => CUP_SHORT[t.kind]).join('→'))
      .filter(Boolean)
      .join(' / ');
    return draws.length > 1 ? draws.map((d, k) => `第${CN_NUM[k + 1]}支：${one(d)}`).join('；') : one(draws[0]);
  }

  function questionNote() {
    return `${[...S.question].length} 字，${S.oracleSent ? '我已把原文送去云端' : '原文没有离开你的设备'}`;
  }

  // 收尾：算出整局用时与画像，剩下的编排交给公共层的 finishRound（它会回调下面的 ledgerData / memory / onEnd）
  function finish() {
    if (ctx.round.finished) return;
    S.prevVisit = lastVisit;
    const totalMs = performance.now() - S.t0;
    const portrait = readPortrait(view());
    S.portrait = portrait;
    fin = { totalMs, portrait, state: signState() };
    gloss(`你是${portrait.who}，把握 ${Math.round(portrait.conf * 100)}%`);
    finishRound(ctx, game);
  }

  // 行为账本的原始数据：公共层用它定命盘的种子
  function ledgerData() {
    const { totalMs } = fin;
    const r = ctx.round;
    return {
      branch: branch().zhi, clock: S.clock.toTimeString().slice(0, 5),
      device: ctx.coarse ? 'touch' : 'mouse',
      domain: S.domain, qlen: [...S.question].length, pick: Math.round(S.pickMs ?? -1),
      shake: Math.round(S.shakeMs), tries: S.shakeTries, sign: S.sign?.no ?? 0,
      hes: S.hesitations.map(Math.round), draws: S.draws, idle: r.idle, hidden: r.hidden,
      throws: S.throws.map((t) => t.kind + (t.kept ? '' : '~')), doubt: r.doubted, total: Math.round(totalMs),
    };
  }

  // 留给“大师记得你”的一条：只有抽出了签才记
  function memory(endKey) {
    if (!S.sign) return null;
    lastVisit = { no: S.sign.no, name: S.sign.name, ending: db.endings[endKey].name, at: new Date().toISOString() };
    return lastVisit;
  }

  function onEnd({ endKey, seed, ledgerData: data, got }) {
    const { totalMs, portrait, state } = fin;
    const tone = S.sign ? db.levels[S.sign.level] : 'ping';
    const notes = ledgerNotes(view(), { domain: S.domain && db.domains[S.domain], sign: S.sign, totalMs, portrait });
    S.end = { endKey, tone, totalMs, state, seed, fields: Object.keys(data).length, notes, got, who: portrait.who };
  }

  // 交给大师细看的行为账本：只给他需要察言观色的东西
  function behaviorForOracle() {
    const h = S.hesitations;
    return {
      时辰: `${branch().zhi}时 ${S.clock.toTimeString().slice(0, 5)}`,
      设备: ctx.coarse ? '手机' : '电脑',
      选方向用时: S.pickMs != null ? `${sec(S.pickMs)} 秒` : '',
      摇签: S.shakeTries ? `${sec(S.shakeMs)} 秒，摇了 ${S.shakeTries} 次` : '',
      每次掷前犹豫: h.length ? h.map((x) => `${sec(x)} 秒`).join('、') : '',
      重求签: `${Math.max(0, S.draws - 1)} 次`,
      发呆: `${ctx.round.idle} 次`,
      离开页面: `${ctx.round.hidden} 次`,
      第几次来: `${ctx.store.get('visits', 1)}`,
      上次的签: S.prevVisit ? `${S.prevVisit.name}（${S.prevVisit.ending}）` : '',
      我的判断: [S.reads.sure && `有 ${S.reads.sure.pct}% 把握猜中他`, S.reads.disappoint && `猜他 ${S.reads.disappoint.pct}% 会失望`, S.portrait && `画像：${S.portrait.who}`].filter(Boolean).join('；'),
    };
  }

  async function askOracle() {
    const sign = S.sign;
    S.oracleSent = !!S.question; // 发请求前就设好：账本里“原文有没有离开设备”马上就对
    const res = await consultOracle(ctx, {
      question: S.question,
      body: {
        domain: S.domain ? db.domains[S.domain].name : '',
        question: S.question,
        sign: sign ? { name: sign.name, level: sign.level, poem: sign.poem, jie: sign.jie, bai: sign.bai } : null,
        cups: S.cups.map((c) => CUP_NAMES[c.kind]).join('、'), verdict: signState().text,
        ending: db.endings[S.end.endKey].name, persona: S.end.who,
        behavior: behaviorForOracle(),
      },
      onShi: (shi) => { S.aiShi = shi; },
    });
    if (res.stale) return; // 玩家已经开了新的一局
    S.oracleSent = res.sent;
  }

  // 结局坦白：旁批里的数字是怎么从你身上算出来的；通灵返回后，大师细看的实话放在最前
  function confessItems() {
    const items = S.aiShi.map((text) => ({ text, ai: true }));
    const { sure, disappoint } = S.reads;
    if (sure) items.push({ text: `我说有 ${sure.pct}% 的把握猜中你，是因为${sure.reason}。` });
    if (disappoint) items.push({ text: `我猜你 ${disappoint.pct}% 会失望，因为${disappoint.reason}。` });
    if (S.portrait) items.push({ text: `我说你是“${S.portrait.who}”，把握 ${Math.round(S.portrait.conf * 100)}%——${S.portrait.why}。` });
    if (S.sign) items.push({ text: `至于这支签：${S.sign.machine}` });
    const prev = S.prevVisit; // 这一局之前的那一次（结局时 lastVisit 已被改写成这一局）
    if (prev) {
      items.push({ text: `${daysAgoText(prev.at)}你来过，抽到“${prev.name}”，得了“${prev.ending}”。你以为关掉页面我就忘了——我一直记得。` });
    }
    return items;
  }

  function ledgerRows() {
    const e = S.end;
    if (!e) return [];
    const h = S.hesitations;
    const rows = [
      ['来访时辰', `${branch().zhi}时（设备时钟 ${S.clock.toTimeString().slice(0, 5)}）`],
      ['设备', ctx.coarse ? '移动端，触屏' : '桌面端，鼠标'],
      ['问的方向', S.domain ? db.domains[S.domain].name : '未选'],
      ['你写的问题', S.question ? questionNote() : '未写'],
      ['选方向用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
      ['摇签', S.shakeTries ? `${sec(S.shakeMs)} 秒，${S.shakeTries} 次` : '—'],
      ['得签', S.sign ? `${signNo(S.sign)} ${S.sign.name}（${S.sign.level}）` : '—'],
      ['每次掷前犹豫', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
      ['重求签', `${Math.max(0, S.draws - 1)} 次`],
      ['掷筊', S.throws.length ? cupsRecord() : '—'],
      ['静止超过八秒', `${ctx.round.idle} 次`],
      ['离开页面', `${ctx.round.hidden} 次`],
      ['总用时', `${Math.floor(e.totalMs / 60000)} 分 ${Math.round((e.totalMs % 60000) / 1000)} 秒`],
      ['我给你的画像', `${S.portrait.who}，把握 ${Math.round(S.portrait.conf * 100)}%`],
      ['图的编号', e.seed.toString(16).padStart(8, '0')],
    ];
    return rows.map(([k, v]) => ({ k, v, note: e.notes[k] }));
  }

  /* ───────── 分享图 ───────── */
  async function makePoster() {
    const { endKey, seed, state } = S.end;
    const ending = db.endings[endKey];
    const sign = S.sign;
    const now = new Date();
    const blob = await drawPoster({
      sign: sign && { no: signFull(sign), name: sign.name, level: sign.level, poem: sign.poem, bai: sign.bai },
      cups: S.cups.length ? S.cups.map((c) => CUP_NAMES[c.kind]).join(' · ') : '还没掷筊',
      state: state.text,
      stateNo: state.key === 'no',
      ending,
      throws: S.throws,
      seed,
      date: `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`,
    }, posterSpec);
    gloss('你想把我给的命带走');
    return { blob, name: `演算天机-${sign ? sign.name : ending.name}.png` };
  }

  /* ───────── 回卷首 / 再来一局 ───────── */
  function resetAll({ clear = true } = {}) {
    shake.holdEnd();
    ui.posterOpen = false;
    if (clear) { ctx.clearGloss(); ctx.fx.clear(); } // 回卷首才清眉批与墨；“再求一签”不清，大师接着记
    ctx.el.huaxin.classList.remove('is-broken');
    resetOracle();
    ctx.resetRound();
    fin = null;
    Object.assign(S, freshState());
  }

  // 回卷首：放弃这一局，回到签卷的入口
  function toStart() {
    tube?.stop();
    resetAll();
    ctx.show('title');
    bootTitle();
  }

  function again() {
    const visits = ctx.visits.bump();
    resetAll({ clear: false });
    gloss(`你又来问了，第 ${visits} 次`);
    enterDing();
  }

  bootTitle();

  const game = {
    S,
    db,
    shake,
    branch,
    // 屏要用的
    begin, pickDomain, confirmDing, attachTube, registerToss, enterJiao, playerThrow, accept, reroll, again, toStart,
    signState, signNo, signFull, confessItems, ledgerRows, askOracle,
    // 公共层要用的（接口见 src/juan/index.js）
    attitude, ledgerData, memory, onEnd, finish, makePoster,
    canDoubt: () => RITUAL.includes(ctx.screen), // 在定盘、摇签、掷筊时可以存疑
    busy: () => shake.holding || (ctx.screen === 'qian' && !!tube?.active), // 正在摇签，不算发呆
    canOracle: () => !!S.sign,
    get posterOpen() { return ui.posterOpen; },
    set posterOpen(v) { ui.posterOpen = v; },
    destroy() {
      shake.destroy();
      tube?.stop();
    },
  };
  return game;
}
