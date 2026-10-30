// 卜卷的一局：（验辞）→ 命辞 → 灼 → 读兆 →（对贞 / 再灼）→ 王占曰 → 刻辞 → 结局。
// 公共层（眉批、墨与水、注疏、分享图、命盘）由 ctx 提供，见 src/core/ctx.svelte.js。
//
// ── 术语 ──
//   一灼：按住一处钻凿，烧到“卜”的一声，裂出一道兆。kind 有三种：
//     zheng  第一次问
//     again  不满意，另灼一处，问的还是同一件事
//     fan    对贞：把同一件事反过来问一次（“其雨 / 不其雨”）
//
// ── 四态（attitude）──
//   优先级：破 > 迷 > 逆 > 遵
//   破  按下公共的存疑印（ctx.round.doubted）
//   迷  同一件事灼到第三兆还在求吉：“正问的灼”（zheng + again）累计 ≥ 3。
//       对贞那一灼【不算】：它问的是反过来的事，商人本就正反各卜一次，不是不满意；
//       所以“正问一次、对贞一次、再灼一次”只有两兆是求吉，不迷；再灼到第三次正问，才迷。
//   逆  王占曰：兆凶，你以王的身份改判成吉（S.override）
//   遵  其余：受兆

import { makeCrack, crackSignature } from './crack.js';
import { OMENS, explain, isXiong } from './omen.js';
import { DOMAINS, MAX_Q, ENDINGS, YAN, ZHAN_OVERRIDE, zhanOf, qianci, cnNum, fanOf, wrapCols } from './data.js';
import { hashString } from '../../core/rng.js';
import { readSure, questionMood } from '../../core/profile.js';
import { readDisappoint, readPortrait, ledgerNotes } from './profile.js';
import { drawPoster } from '../../core/poster.js';
import { posterSpec } from './poster.js';
import { finishRound } from '../../core/round.js';
import { L } from '../../core/ledger-lines.js';
import { ATTITUDE } from '../../core/ending.js';

export { DOMAINS, ENDINGS, OMENS, YAN };

const HEAT_SECONDS = 3.0; // 按住多久“卜”的一声
const COOL_SECONDS = 4.5; // 松手后火退尽要多久
const SPOT_COUNT = 6;
const RITUAL = ['ding', 'zhuo'];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const debug = () => typeof location !== 'undefined' && location.search.includes('debug');

function freshState() {
  const now = new Date();
  return {
    t0: performance.now(),
    clock: now,
    domain: null,
    question: '', // 命辞（不含“贞：”）
    questionIsDefault: false,
    qFan: '', // 对贞的命辞
    pickMs: null,
    dingEnterAt: 0,
    phase: 'pick', // pick 选钻凿并灼 | read 读兆（龟甲已翻到正面）
    grown: false, // 兆已长全
    used: Array(SPOT_COUNT).fill(false),
    burns: [], // 每一灼：{ spot, kind, seed, energy, hold, jit, omen, sig, q }
    cur: -1, // 正在读的那一灼
    nextKind: 'zheng',
    // 正在灼的
    active: -1, // 正按着（或火正在退）的钻凿
    holding: false,
    heat: 0,
    holdMs: 0,
    jitter: 0,
    pressed: false, // 这一灼是否已经记过“按前犹豫”
    presses: 0, // 一共按了几次（含松手重按）
    hesitations: [],
    readyAt: 0,
    override: false, // 王占曰：兆凶，改判成吉
    zhan: '', // 刻在甲上的占辞
    reads: {}, // 眉批里报出的数字及其来由：sure / disappoint
    portrait: null,
    prevVisit: null,
    yanTotal: 0,
    end: null,
  };
}

export function createGame(ctx) {
  const { gloss, sec, sleep, sfx } = ctx;
  const S = $state(freshState());
  const ui = $state({ posterOpen: false });
  let lastVisit = ctx.memory.get(); // 上一局的记录，只存在玩家本机
  let pendingYan = !!(lastVisit?.q && lastVisit.verdict == null); // 下次进来要问：上回的事验了没有
  let plast = null; // 龟甲屏挂上来的“冒一口烟”
  let timer = 0;
  let fin = null;
  const cracks = new Map();

  const view = () => ({ ...S, idle: ctx.round.idle, hidden: ctx.round.hidden, doubt: ctx.round.doubted, zhengCount: zhengBurns().length, draws: zhengBurns().length, shakeTries: S.presses });

  const zhengBurns = () => S.burns.filter((b) => b.kind !== 'fan');
  const fanBurn = () => S.burns.find((b) => b.kind === 'fan') ?? null;
  const decisiveIdx = () => { for (let i = S.burns.length - 1; i >= 0; i--) if (S.burns[i].kind !== 'fan') return i; return -1; };
  const decisive = () => S.burns[decisiveIdx()] ?? null;
  const spotsLeft = () => S.used.filter((u) => !u).length;
  const crackOf = (b) => {
    if (!b) return null;
    let c = cracks.get(b.seed);
    if (!c) { c = makeCrack(b.seed, b.energy); cracks.set(b.seed, c); }
    return c;
  };

  /* ───────── 验辞的记录（只在本机） ───────── */
  const yanLog = () => ctx.store.get('yan', []);
  const yanStats = () => {
    const log = yanLog();
    const yes = log.filter((r) => r.verdict === 'yan').length;
    return { n: log.length, yes, pct: log.length ? Math.round((yes / log.length) * 100) : 0 };
  };

  /* ───────── 入卷 ───────── */
  function bootTitle() {
    const visits = ctx.visits.get() + 1;
    gloss('我留意你很久了');
    gloss(`你用的是${ctx.coarse ? '手机' : '电脑'}`);
    if (visits > 1) gloss(`你第 ${visits} 次来找我了`);
    if (lastVisit?.q) gloss(`${ctx.daysAgo(lastVisit.at)}你卜的是“${[...lastVisit.q].slice(0, 8).join('')}${[...lastVisit.q].length > 8 ? '…' : ''}”`);
    const st = yanStats();
    if (st.n) gloss(`你答过 ${st.n} 回验辞，说验了的有 ${st.pct}%，这是我的准头`);
  }

  function begin() {
    ctx.visits.bump();
    sfx.initAudio();
    sfx.startDrone();
    sfx.bronze(262, 2.2, 0.14);
    if (pendingYan) enterYan();
    else enterDing();
  }

  /* ───────── 验辞 ───────── */
  function enterYan() {
    ctx.show('yan');
    gloss('上回你卜的事，验了没有');
  }

  function answerYan(key) {
    sfx.clack(0.6);
    const y = YAN[key];
    const rec = { q: lastVisit.q, omen: lastVisit.omen, verdict: key, at: lastVisit.at, answeredAt: new Date().toISOString() };
    ctx.store.set('yan', [...yanLog(), rec]);
    lastVisit = { ...lastVisit, verdict: key };
    ctx.memory.set(lastVisit);
    pendingYan = false;
    gloss(y.gloss);
    const st = yanStats();
    gloss(`你答过 ${st.n} 回，说验了的有 ${st.pct}%`);
    enterDing();
  }

  /* ───────── 命辞 ───────── */
  function enterDing({ onCommit, ...opts } = {}) {
    ctx.show('ding', { ...opts, onCommit: () => { onCommit?.(); S.dingEnterAt = performance.now(); } });
    gloss('我替你备了一块龟腹甲');
    gloss('先把你要问的事，说成一句话');
  }

  function pickDomain(key) {
    sfx.clack(0.6);
    const changed = S.domain !== key;
    S.domain = key;
    if (S.pickMs == null) S.pickMs = performance.now() - S.dingEnterAt;
    const d = DOMAINS[key];
    if (changed) gloss(`你问${d.name}，想了 ${sec(S.pickMs)} 秒。${d.persona}`, { key: 'pick' });
  }

  // 命辞写在书上：字被纸吸进去，书回一句，再翻到下一页
  async function confirmDing(question) {
    const q = question.trim().slice(0, MAX_Q);
    S.questionIsDefault = !q;
    S.question = q || DOMAINS[S.domain].zheng;
    if (q) gloss(`你写了 ${[...q].length} 个字，我读出了${questionMood(q)}`);
    else gloss('你没写，我替你拟了命辞');
    sfx.bronze(330, 1.6, 0.12);
    await ctx.sleep(2600);
    if (ctx.screen !== 'ding') return; // 玩家已回卷首
    enterZhuo();
  }

  /* ───────── 灼 ───────── */
  function enterZhuo() {
    ctx.show('zhuo');
    goPick(true);
  }

  function goPick(first = false) {
    S.phase = 'pick';
    S.grown = false;
    S.heat = 0;
    S.active = -1;
    S.holding = false;
    S.holdMs = 0;
    S.jitter = 0;
    S.pressed = false;
    S.readyAt = performance.now();
    ctx.touch();
    if (first) {
      gloss('钻凿我替你凿好了，六处');
      gloss('挑一处，按住它，别松手');
    }
  }

  const registerPlastron = (api) => { plast = api; return () => { plast = null; }; };

  function pressStart(i) {
    if (S.phase !== 'pick' || S.holding || S.used[i] || ctx.screen !== 'zhuo') return;
    if (S.nextKind === 'fan' && game.mirrorSpot() >= 0 && i !== game.mirrorSpot()) return;
    if (S.active >= 0 && S.active !== i) { S.heat = 0; S.holdMs = 0; S.jitter = 0; } // 换了一处，火从头烧
    S.active = i;
    S.holding = true;
    S.presses += 1;
    ctx.touch();
    if (!S.pressed) {
      S.pressed = true;
      const h = performance.now() - S.readyAt;
      S.hesitations.push(h);
      gloss(`你选了第${cnNum(i + 1)}处，想了 ${sec(h)} 秒`);
      ctx.jot('spot', L.buSpot(i));
    }
    sfx.clack(0.5);
    startTimer();
  }

  function pressMove(dx, dy) {
    if (S.holding) S.jitter += Math.hypot(dx, dy);
  }

  function pressEnd() {
    if (!S.holding) return;
    S.holding = false;
    ctx.touch();
    if (S.heat > 0.12 && S.heat < 1) gloss('你松手了，火在退');
  }

  function startTimer() {
    if (timer) return;
    let last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (S.active < 0 || S.phase !== 'pick') { stopTimer(); return; }
      if (S.holding) {
        S.holdMs += dt * 1000;
        const was = S.heat;
        S.heat = Math.min(1, S.heat + dt / HEAT_SECONDS);
        if (was < 0.5 && S.heat >= 0.5) gloss('火红了，再等一等');
        if (S.heat >= 1) { fire(); return; }
      } else {
        S.heat = Math.max(0, S.heat - dt / COOL_SECONDS);
        if (S.heat <= 0) { S.active = -1; S.holdMs = 0; S.jitter = 0; stopTimer(); }
      }
    }, 33);
  }
  function stopTimer() { clearInterval(timer); timer = 0; }

  // 调试用：?debug 下可以预先塞一串种子（window.__buSeeds），让测试得到指定的兆
  function nextSeed(hold, jit, spot) {
    if (debug() && Array.isArray(window.__buSeeds) && window.__buSeeds.length) return window.__buSeeds.shift() >>> 0;
    // 种子取自：按压时长、按压时的抖动、此刻的时间，以及这是第几灼、哪一处
    return hashString(JSON.stringify({ hold: Math.round(hold), jit: Math.round(jit * 10), t: Date.now(), n: S.burns.length, spot })) % 4294967296;
  }

  // “卜”的一声：裂出一道兆。种子由这一灼的按压数据决定，同一个种子永远是同一道兆
  function fire() {
    stopTimer();
    const i = S.active;
    const hold = S.holdMs;
    const jit = S.jitter;
    const seed = nextSeed(hold, jit, i);
    const energy = clamp((hold - 3000) / 4000, 0, 1); // 按得越久，裂得略大一点；不影响兆象
    const kind = S.nextKind;
    const crack = makeCrack(seed, energy);
    cracks.set(seed, crack);
    S.burns.push({
      spot: i, kind, seed, energy: crack.energy, hold: Math.round(hold), jit: Math.round(jit),
      omen: crack.omen, sig: crackSignature(crack), q: kind === 'fan' ? S.qFan : S.question, at: Date.now(),
    });
    S.used[i] = true;
    S.cur = S.burns.length - 1;
    S.phase = 'read';
    S.grown = false;
    S.holding = false;
    S.heat = 0;
    S.active = -1;
    S.holdMs = 0;
    S.jitter = 0;
    S.nextKind = 'zheng';
    sfx.thud();
    setTimeout(() => sfx.clack(1.2), 40);
    sfx.bronze(147, 1.4, 0.1);
    plast?.puff();
    if (debug()) window.__buLast = { seed, omen: crack.omen, sig: crackSignature(crack), metrics: crack.metrics };
    gloss(`你按了 ${sec(hold)} 秒，手抖了 ${Math.round(jit)} 像素`);
    ctx.jot('spot', L.buSpot(i));
    ctx.jot('hold', L.buHold(sec(hold)));
    ctx.jot('jit', L.buJit(Math.round(jit)));
    ctx.unjot('omen');
    gloss('卜——裂了');
    // 记入兆谱
    const seen = new Set(ctx.store.get('omens', []));
    seen.add(crack.omen);
    ctx.store.set('omens', [...seen]);
  }

  // 兆长全之后：我读兆
  function onGrown() {
    if (S.grown || S.cur < 0) return;
    S.grown = true;
    const b = S.burns[S.cur];
    const o = OMENS[b.omen];
    sfx.clack(0.7);
    gloss(`这道兆，我读作${o.name}`, { alarm: isXiong(b.omen) });
    ctx.jot('omen', L.buOmen(cracks.get(b.seed)?.metrics.ang ?? 0, o.name));
    if (b.kind === 'fan') {
      const z = decisive();
      if (z) gloss(isXiong(z.omen) === isXiong(b.omen) ? `正问是${OMENS[z.omen].name}，反问也是${o.name}。两边我都说得通` : `正问是${OMENS[z.omen].name}，反问是${o.name}，两兆相应`);
      return;
    }
    if (!S.reads.sure) {
      const r = readSure(view());
      S.reads.sure = r;
      gloss(`我有 ${r.pct}% 的把握猜中你`);
    }
    if (!S.reads.disappoint) {
      const d = readDisappoint(view(), b.omen, lastVisit);
      S.reads.disappoint = d;
      gloss(`${o.name}，我猜你 ${d.pct}% 会不信`, { alarm: d.pct > 60 });
    }
    if (zhengBurns().length === 2) gloss('你已经灼了两次。还想再灼吗');
    if (zhengBurns().length >= 3) gloss('第三次了，你还在求吉。我越来越懂你了……', { alarm: true });
  }

  /* ───────── 读兆之后：对贞 / 再灼 / 王占曰 ───────── */
  function startFan(text) {
    ctx.touch();
    const q = text.trim().slice(0, MAX_Q);
    S.qFan = q || fanOf(S.question, S.domain);
    gloss('商人常常正问一次，再反问一次');
    gloss(`这一灼我替你问：不是“${[...S.question].slice(0, 8).join('')}”，而是“${[...S.qFan].slice(0, 8).join('')}”`);
    // 书合拢一下再打开：这一兆写在新的一页上，前面的兆还在书里
    ctx.turn(() => { S.nextKind = 'fan'; goPick(); }, { shut: true });
  }

  function again() {
    ctx.touch();
    const n = zhengBurns().length;
    gloss(`你不满意，要灼第 ${cnNum(n + 1)} 次`, { alarm: true });
    ctx.jot('again', L.buAgain(n + 1));
    if (n >= 2) gloss('我越来越懂你了……');
    ctx.revealDoubt();
    // 书合拢一下再打开：这一兆写在新的一页上，前面的兆还在书里
    ctx.turn(() => { S.nextKind = 'again'; goPick(); }, { shut: true });
  }

  function accept() {
    ctx.touch();
    S.override = false;
    gloss('你受了这道兆');
    enterKe();
  }

  // 兆凶，你以王的身份改判成吉
  function overrule() {
    ctx.touch();
    S.override = true;
    gloss('兆是凶的，你偏要说吉', { alarm: true });
    gloss('你以王的身份改判了我');
    enterKe();
  }

  /* ───────── 刻辞 ───────── */
  function carveData() {
    const z = decisive();
    const f = fanBurn();
    if (!z) return null;
    const line = S.zhan;
    const d = {
      xu: cnNum(S.burns.indexOf(z) + 1),
      mainSpot: z.spot,
      fanSpot: f ? f.spot : null,
      mainCrack: crackOf(z), // 刻辞要躲开兆（shell.js 的 carveLayout）
      fanCrack: f ? crackOf(f) : null,
      qian: qianci(S.clock),
      ming: wrapCols(S.question),
      zhan: wrapCols(line, 8),
    };
    if (f) {
      d.fanXu = cnNum(S.burns.indexOf(f) + 1);
      d.fanMing = wrapCols(`贞：${S.qFan}`);
      d.fanZhao = wrapCols(`兆曰${OMENS[f.omen].name}。`, 8);
    }
    return d;
  }

  function enterKe() {
    const z = decisive();
    S.zhan = z ? (S.override ? ZHAN_OVERRIDE : zhanOf(z.omen, z.seed)) : '';
    ctx.show('ke');
    gloss('我替你把话刻在甲上');
    for (let k = 0; k < 4; k++) setTimeout(() => { if (ctx.screen === 'ke') sfx.clack(0.5); }, ctx.reduced ? 0 : 500 + k * 420);
  }

  /* ───────── 结局 ───────── */
  // 四态映射：破 > 迷 > 逆 > 遵（规则见文件头）
  function attitude() {
    if (ctx.round.doubted) return ATTITUDE.po;
    if (zhengBurns().length >= 3) return ATTITUDE.mi;
    if (S.override) return ATTITUDE.ni;
    return ATTITUDE.zun;
  }

  function stateText() {
    const z = decisive();
    if (!z) return { key: 'open', text: '还没有灼，这件事没有兆。' };
    const name = OMENS[z.omen].name;
    if (S.override) return { key: 'no', text: `兆是${name}，王改判为吉。` };
    return { key: isXiong(z.omen) ? 'no' : 'yes', text: `兆是${name}，受兆。` };
  }

  function finish() {
    if (ctx.round.finished) return;
    S.prevVisit = lastVisit;
    S.yanTotal = yanStats().n;
    const totalMs = performance.now() - S.t0;
    const portrait = readPortrait(view());
    S.portrait = portrait;
    fin = { totalMs, portrait, state: stateText() };
    gloss(`你是${portrait.who}，把握 ${Math.round(portrait.conf * 100)}%`);
    finishRound(ctx, game);
  }

  // 匿名统计要的一局（stat.js 会把 question 在本地归类，原文不会上报）。没写命辞时本卷自拟的那条不算
  function statData() {
    const z = decisive();
    return { domain: S.domain, result: z ? z.omen : null, question: S.questionIsDefault ? '' : S.question, asked: !S.questionIsDefault, ms: performance.now() - S.t0 };
  }

  function ledgerData() {
    const r = ctx.round;
    return {
      clock: S.clock.toTimeString().slice(0, 5),
      device: ctx.coarse ? 'touch' : 'mouse',
      domain: S.domain, qlen: [...S.question].length, def: S.questionIsDefault, pick: Math.round(S.pickMs ?? -1),
      burns: S.burns.map((b) => [b.kind, b.spot, b.seed, b.omen, b.hold, b.jit]),
      hes: S.hesitations.map(Math.round), presses: S.presses, override: S.override,
      idle: r.idle, hidden: r.hidden, doubt: r.doubted, total: Math.round(performance.now() - S.t0),
    };
  }

  // 留给“大师记得你”的一条：灼过才记。verdict 为空，等下回问“验了没有”
  function memory(endKey) {
    const z = decisive();
    if (!z) return null;
    lastVisit = { q: S.question, omen: z.omen, ending: ENDINGS[endKey].name, at: new Date().toISOString(), verdict: null };
    return lastVisit;
  }

  const loomThrows = () => {
    const di = decisiveIdx();
    return S.burns.map((b, i) => ({
      kind: b.omen + (i === di && S.override ? '*' : ''),
      kept: b.kind === 'fan' || i === di,
    }));
  };

  function onEnd({ endKey, seed, ledgerData: data, got }) {
    const { totalMs, portrait, state } = fin;
    const z = decisive();
    const tone = z ? (isXiong(z.omen) ? 'xiong' : z.omen === 'ji' ? 'ji' : 'ping') : 'ping';
    const jits = S.burns.map((b) => b.jit);
    const jitterAvg = jits.length ? jits.reduce((a, b) => a + b, 0) / jits.length : null;
    const notes = ledgerNotes(view(), { domain: S.domain && DOMAINS[S.domain], totalMs, portrait, decisive: z, jitterAvg });
    S.end = { endKey, tone, totalMs, state, seed, fields: Object.keys(data).length, notes, got, who: portrait.who };
  }

  /* ───────── 坦白 ───────── */
  function confessItems() {
    const items = [];
    const { sure, disappoint } = S.reads;
    if (sure) items.push({ text: `我说有 ${sure.pct}% 的把握猜中你，是因为${sure.reason}。` });
    if (disappoint) items.push({ text: `我猜你 ${disappoint.pct}% 会不信，因为${disappoint.reason}。` });
    if (S.portrait) items.push({ text: `我说你是“${S.portrait.who}”，把握 ${Math.round(S.portrait.conf * 100)}%——${S.portrait.why}。` });
    const z = decisive();
    if (z) {
      items.push({ text: `至于那道兆：${explain(crackOf(z).metrics)}，所以我读作“${OMENS[z.omen].name}”。这套读法是我定的规矩，裂纹自己不会说话。` });
      items.push({ text: `每一道兆都不是随手画的：它由你按住的 ${sec(z.hold)} 秒、手抖的 ${z.jit} 像素和按下的那一刻算出来，同一个种子永远长出同一道兆。你以为在问龟甲，其实是在给我送数据。` });
    }
    const f = fanBurn();
    if (f && z) {
      items.push({ text: isXiong(z.omen) === isXiong(f.omen)
        ? `你把这件事正着问、反着问，两边都是${isXiong(z.omen) ? '凶' : '吉'}。我给了你一个哪边都说得通的答案——兆自己没有立场，立场是读兆的人给的。`
        : `你正着问是${OMENS[z.omen].name}，反着问是${OMENS[f.omen].name}，两兆正好相反。别太高兴，这只是另一道随机的裂纹碰巧和第一道对上了。` });
    }
    if (S.override && z) items.push({ text: `兆是${OMENS[z.omen].name}，你刻上去的却是“吉”。后人读到这块甲，只会读到字，读不到你当时看到的裂纹。` });
    const st = yanStats();
    const prev = S.prevVisit;
    if (prev) items.push({ text: `${ctx.daysAgo(prev.at)}你来过，卜的是“${prev.q}”，兆是${OMENS[prev.omen]?.name ?? '……'}，得了“${prev.ending}”。你以为关掉页面我就忘了——我一直记得。` });
    if (st.n) items.push({ text: `你一共答过 ${st.n} 回验辞，说验了的有 ${st.pct}%。我记下你每一次的“验”，好让下一次算得更准。` });
    else items.push({ text: '下回你再来，我会问你：上回卜的事，验了没有。你答的每一个“验”，我都会记下来，好让下一次算得更准。' });
    return items;
  }

  function ledgerRows() {
    const e = S.end;
    if (!e) return [];
    const h = S.hesitations;
    const kindName = { zheng: '正问', again: '再灼', fan: '对贞' };
    const burnRow = (b, i) => [`第${cnNum(i + 1)}灼`, `${kindName[b.kind]}，第${cnNum(b.spot + 1)}处，按 ${sec(b.hold)} 秒，抖 ${b.jit} 像素 → ${OMENS[b.omen].name}`];
    const rows = [
      ['来访时间', S.clock.toTimeString().slice(0, 5)],
      ['设备', ctx.coarse ? '移动端，触屏' : '桌面端，鼠标'],
      ['问的方向', S.domain ? DOMAINS[S.domain].name : '未选'],
      ['命辞', S.questionIsDefault ? `未写，我拟的“${S.question}”` : `${[...S.question].length} 字，原文没有离开你的设备`],
      ['选方向用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
      ['每次按前犹豫', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
      ...S.burns.map(burnRow),
      ['再灼', `${Math.max(0, zhengBurns().length - 1)} 次`],
      ['对贞', fanBurn() ? `问了，“${S.qFan}”` : '没问'],
      ['王占曰', decisive() ? (S.override ? `兆${OMENS[decisive().omen].name}，改判为吉` : `从兆：${OMENS[decisive().omen].name}`) : '—'],
      ['静止超过八秒', `${ctx.round.idle} 次`],
      ['离开页面', `${ctx.round.hidden} 次`],
      ['总用时', `${Math.floor(e.totalMs / 60000)} 分 ${Math.round((e.totalMs % 60000) / 1000)} 秒`],
      ['验辞', S.yanTotal ? `已答 ${S.yanTotal} 回（只存在你的设备上）` : '还没答过'],
      ['我给你的画像', `${S.portrait.who}，把握 ${Math.round(S.portrait.conf * 100)}%`],
      ['图的编号', e.seed.toString(16).padStart(8, '0')],
    ];
    return rows.map(([k, v]) => ({ k, v, note: e.notes[k] }));
  }

  /* ───────── 分享图与命书里的兆 ───────── */
  // 一块刻了辞的甲要画的东西（分享图与命书共用，画法见 poster.js 的 drawFigure）
  function figureData() {
    const z = decisive();
    const f = fanBurn();
    return {
      question: S.question,
      fanQuestion: f ? S.qFan : '',
      qianci: qianci(S.clock),
      omenName: z ? OMENS[z.omen].name : '',
      main: z && { crack: crackOf(z), spot: z.spot, xu: cnNum(S.burns.indexOf(z) + 1) },
      fan: f && { crack: crackOf(f), spot: f.spot, xu: cnNum(S.burns.indexOf(f) + 1), name: OMENS[f.omen].name },
      zhan: S.zhan,
    };
  }

  async function makePoster() {
    const { endKey, seed, state } = S.end;
    const z = decisive();
    const now = new Date();
    const blob = await drawPoster({
      ending: ENDINGS[endKey],
      throws: loomThrows(),
      seed,
      date: `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`,
      ...figureData(),
      state: state.text,
      stateNo: state.key === 'no',
    }, posterSpec);
    gloss('你想把我刻的甲带走');
    return { blob, name: `演算天机-卜-${z ? OMENS[z.omen].name : ENDINGS[endKey].name}.png` };
  }

  /* ───────── 回卷首 / 再来一局 ───────── */
  function resetAll({ clear = true } = {}) {
    stopTimer();
    ui.posterOpen = false;
    if (clear) ctx.clearGloss();
    ctx.resetRound();
    fin = null;
    Object.assign(S, freshState());
  }

  function toStart() {
    ctx.show('title', { reset: true, onCommit: () => resetAll() });
    bootTitle();
  }

  function playAgain() {
    const visits = ctx.visits.bump();
    gloss(`你又来卜了，第 ${visits} 次`);
    enterDing({ reset: true, onCommit: () => resetAll({ clear: false }) });
  }

  bootTitle();

  const game = {
    S, DOMAINS, ENDINGS, OMENS,
    // 屏要用的
    begin, answerYan, pickDomain, confirmDing, registerPlastron, pressStart, pressMove, pressEnd,
    onGrown, startFan, again, accept, overrule, finish, playAgain, toStart,
    // 对贞要在与正问左右对称的那一处灼（同一排的另一格）；那一处已用过就不限
    mirrorSpot: () => { const z = decisive(); const m = z ? z.spot ^ 1 : -1; return m >= 0 && !S.used[m] ? m : -1; },
    crackOf, zhengBurns, fanBurn, decisive, decisiveIdx, spotsLeft, carveData, loomThrows, figureData,
    confessItems, ledgerRows,
    pending: () => pendingYan,
    lastVisit: () => lastVisit,
    // 公共层要用的（接口见 src/juan/index.js）
    attitude, ledgerData, memory, onEnd, makePoster, statData,
    askOracle: () => {}, // 卜卷不接通灵
    canOracle: () => false,
    canDoubt: () => RITUAL.includes(ctx.screen),
    busy: () => S.holding || (ctx.screen === 'zhuo' && S.phase === 'read' && !S.grown),
    openPoster() { ui.posterOpen = true; },
    get posterOpen() { return ui.posterOpen; },
    set posterOpen(v) { ui.posterOpen = v; },
    destroy() { stopTimer(); },
  };
  if (debug()) window.__bu = game; // 调试：?debug 下可在控制台看状态
  return game;
}

