// 卦卷的一局：问事 → 起卦（六次掷钱）→ 解卦 → 结局。
// 公共层（眉批、墨与水、注疏、分享图、命盘）由 ctx 提供，见 src/core/ctx.svelte.js。
// 卜的规矩与四态映射写在 attitude()。

import db from './gua.json';
import { createShell } from './shell.js';
import {
  YAO, KIND_OF, CN_YAO, faceText, tossCoin, valueOf, isMoving, bitOf, binOf, changedBin, afterChange, xiantianValue, indexByBin,
} from './yao.js';
import { G } from './words.js';
import { readRecast, readPortrait, ledgerNotes } from './profile.js';
import { readSure, questionMood } from '../../core/profile.js';
import { createShake } from '../../core/shake.svelte.js';
import { drawPoster } from '../../core/poster.js';
import { posterSpec } from './poster.js';
import { finishRound } from '../../core/round.js';
import { ATTITUDE } from '../../core/ending.js';
import { atlas } from './atlas.js';

export { db };
const HEX = indexByBin(db);
const RITUAL = ['ding', 'cast', 'jie'];

function freshState() {
  const now = new Date();
  return {
    t0: performance.now(),
    clock: now,
    domain: null,
    question: '',
    dingEnterAt: 0,
    pickMs: null,
    casts: [], // 已经起完的每一卦：{ lines: [{ v, faces }], bin, hex, changed }
    cur: [], // 正在起的这一卦已经掷出的爻：{ v, faces }
    result: null, // 这一卦起完之后：{ hex, changed, bits, value, nMoving }
    rolling: false, // 钱在飞、或爻正在写，这时不能再摇
    fresh: -1, // 刚写出的那一爻（卦画里让它一笔写成）
    throws: [], // 每一次掷出：{ kind, v, faces, cast, kept }
    shakeMs: 0,
    shakeTries: 0,
    hesitations: [],
    readyAt: 0,
    tried: false, // 这一爻前已经按下过了
    reads: {},
    portrait: null,
    prevVisit: null,
    end: null,
  };
}

export function createGame(ctx) {
  const { gloss, sec, sfx } = ctx;
  const S = $state(freshState());
  const ui = $state({ posterOpen: false });
  let lastVisit = ctx.memory.get(); // 上一局的记录，只存在玩家本机
  let shell = null;
  let castApi = null; // 起卦屏挂上来的：卦画上某一爻的位置
  let fin = null; // 收尾时算好的：整局用时、画像
  let timers = [];

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
  const view = () => ({ ...S, idle: ctx.round.idle, hidden: ctx.round.hidden, doubt: ctx.round.doubted });

  /* ───────── 摇动控制（公共层） ───────── */
  const shake = createShake(ctx, {
    tube: () => shell,
    active: () => ctx.screen === 'cast' && !S.rolling && S.cur.length < 6,
    onTry: () => {
      S.shakeTries += 1;
      if (S.tried) return;
      S.tried = true;
      const h = performance.now() - S.readyAt;
      S.hesitations.push(h);
      if (h >= 6000) gloss(G.hesitate(h));
    },
  });

  /* ───────── 入卷 ───────── */
  function bootTitle() {
    const visits = ctx.visits.get() + 1;
    gloss(G.boot);
    gloss(G.device(ctx.coarse));
    if (visits > 1) gloss(G.visits(visits));
    if (lastVisit) gloss(G.last(ctx.daysAgo(lastVisit.at), lastVisit.name));
  }

  function begin() {
    shake.requestMotion(); // iOS 只允许在点击里申请“动作与方向”权限
    ctx.visits.bump();
    sfx.initAudio();
    sfx.startDrone();
    sfx.bronze(330, 2.2, 0.14);
    enterDing();
  }

  /* ───────── 问事 ───────── */
  function enterDing() {
    ctx.show('ding');
    S.dingEnterAt = performance.now();
    gloss(G.dingEnter);
  }

  function pickDomain(key) {
    sfx.clack(0.6);
    const changed = S.domain !== key;
    S.domain = key;
    if (S.pickMs == null) S.pickMs = performance.now() - S.dingEnterAt;
    const d = db.domains[key];
    if (changed) gloss(G.pick(d.name, S.pickMs, d.persona), { key: 'pick' });
  }

  function confirmDing(question) {
    S.question = question.trim().slice(0, 40);
    if (S.question) gloss(G.question([...S.question].length, questionMood(S.question)));
    sfx.bronze(392, 1.6, 0.12);
    enterCast();
  }

  /* ───────── 起卦：六次掷钱 ───────── */
  function enterCast() {
    ctx.show('cast');
    S.cur = [];
    S.result = null;
    S.rolling = false;
    S.fresh = -1;
    S.tried = false;
    S.readyAt = performance.now();
    gloss(S.casts.length ? G.castAgain(S.casts.length + 1) : G.castFirst);
  }

  // 起卦屏挂上时创建龟壳；离开时停掉
  function attachShell(svg) {
    shell = createShell(svg, {
      sfx,
      reduced: ctx.reduced,
      onRelease: rollCoins,
      onLanded: ({ activeMs, coins }) => settle(coins.map((c) => c.face), activeMs),
    });
    if (location.search.includes('debug')) window.__shell = shell; // 调试：面板隐藏时 rAF 暂停，可手动 step()
    shell.start();
    return () => { shell?.stop(); shake.holdEnd(); shell = null; };
  }

  function registerCast(api) { castApi = api; return () => { castApi = null; }; }

  // 出手：三枚铜钱的朝向在这一刻就定了（真随机）；可以在页面里注入 window.__coins 来复现某一掷（调试用）
  function rollCoins() {
    S.rolling = true;
    const forced = location.search.includes('debug') && window.__coins?.length ? window.__coins.shift() : null;
    return forced ?? [tossCoin(), tossCoin(), tossCoin()];
  }

  // 钱落定了：壳把朝向交过来，写出这一爻
  function settle(faces, activeMs) {
    if (ctx.screen !== 'cast' || !S.rolling) return; // 玩家已回卷首
    const v = valueOf(faces);
    const idx = S.cur.length;
    S.cur.push({ v, faces });
    S.shakeMs += activeMs;
    S.throws.push({ kind: KIND_OF[v], v, faces, cast: S.casts.length, kept: true });
    S.fresh = idx;
    const bits = binOf(S.cur.map((l) => l.v));
    const y = YAO[v];
    if (y.kind === 'laoyang') gloss(G.laoyang);
    else if (y.kind === 'laoyin') gloss(G.laoyin);
    gloss(G.bits(bits));
    sfx.drip(0.05);
    later(() => { // 爻写出来的一刻：落点洇开一团墨晕、起一圈水纹
      if (ctx.screen !== 'cast') return;
      const p = castApi?.point(idx);
      if (!p) return;
      ctx.fx.wash(p.x, p.y, { R: 70, a: 0.1, grow: 1.0, hold: 0.2, fade: 1.4 });
      ctx.fx.ripple(p.x, p.y, { r: 60, rings: 2, a: 0.18 });
    }, 260);
    if (S.cur.length < 6) {
      later(() => { S.rolling = false; S.tried = false; S.readyAt = performance.now(); ctx.touch(); }, 900);
      return;
    }
    later(completeCast, 1100);
  }

  function completeCast() {
    if (ctx.screen !== 'cast') return;
    const vs = S.cur.map((l) => l.v);
    const bin = binOf(vs);
    const cb = changedBin(vs);
    const hex = HEX.get(bin);
    const changed = cb ? HEX.get(cb) : null;
    const nMoving = vs.filter(isMoving).length;
    const value = xiantianValue(bin);
    S.casts.push({ lines: S.cur.map((l) => ({ ...l })), bin, hex, changed });
    S.result = { hex, changed, bits: bin, value, nMoving, vs };
    atlas.mark(ctx.store, hex.no);
    gloss(G.castDone(hex.name, nMoving));
    gloss(G.decimal(value));
    if (!S.reads.sure) {
      const r = readSure(view());
      S.reads.sure = r;
      gloss(G.sure(r.pct));
    }
    const rc = readRecast(view(), nMoving, lastVisit);
    S.reads.recast = rc;
    gloss(G.predictRecast(rc.pct), { alarm: rc.pct > 60 });
    S.rolling = false;
    if (S.casts.length === 2) gloss(G.mengDone);
    ctx.touch();
  }

  /* ───────── 解卦 ───────── */
  function toJie() {
    ctx.touch();
    sfx.bronze(392, 1.2, 0.1);
    ctx.show('jie');
  }

  // 右边的按钮：再起一卦。第一次，我引《蒙》卦的话拦你；你仍然要看，就是“逆”；起到第三卦，就是“迷”
  function recast() {
    ctx.touch();
    const n = S.casts.length; // 已经起完几卦
    if (n === 1) { gloss(G.meng, { alarm: true }); gloss(G.mengAfter); }
    else if (n === 2) { gloss(G.third, { alarm: true }); gloss(G.understand); }
    else gloss(G.more(n + 1), { alarm: true });
    ctx.revealDoubt();
    S.throws.forEach((t) => { t.kept = false; });
    enterCast();
  }

  // 左边的按钮：受卦
  function accept() {
    ctx.touch();
    gloss(G.accept);
    finish();
  }

  /* ───────── 结局 ───────── */
  // 四态结局的映射：破 > 迷 > 逆 > 遵（公共层只认这四个键）
  // 以“起完了几卦”为准（只起了一半的卦不算）：
  //   破：按了存疑印，不再信这一套
  //   迷：起完了三卦或更多，想要一个更中意的数
  //   逆：起完了两卦——第一次想再起时，我已引《蒙》卦的“再三渎，渎则不告”拦过你，你仍然要看
  //   遵：只起了一卦，受了它
  function attitude() {
    if (ctx.round.doubted) return ATTITUDE.po;
    if (S.casts.length >= 3) return ATTITUDE.mi;
    if (S.casts.length === 2) return ATTITUDE.ni;
    return ATTITUDE.zun;
  }

  function finish() {
    if (ctx.round.finished) return;
    S.prevVisit = lastVisit;
    const totalMs = performance.now() - S.t0;
    const portrait = readPortrait(view());
    S.portrait = portrait;
    fin = { totalMs, portrait };
    gloss(G.portrait(portrait.who, Math.round(portrait.conf * 100)));
    finishRound(ctx, game);
  }

  // 本局最后一卦（没有起完的不算）
  const lastCast = () => S.casts[S.casts.length - 1] ?? null;

  // 每一爻的掷法，例如"初 少阳 7 / 二 老阴 6"，一卦一段
  function castsRecord(cast) {
    return cast.lines.map((l, i) => `${CN_YAO[i][0]} ${faceText(l.faces[0])}${faceText(l.faces[1])}${faceText(l.faces[2])}→${YAO[l.v].name} ${l.v}`).join(' / ');
  }

  // 行为账本的原始数据：公共层用它定命盘的种子
  function ledgerData() {
    const { totalMs } = fin;
    const r = ctx.round;
    return {
      clock: S.clock.toTimeString().slice(0, 5),
      device: ctx.coarse ? 'touch' : 'mouse',
      domain: S.domain, qlen: [...S.question].length, pick: Math.round(S.pickMs ?? -1),
      shake: Math.round(S.shakeMs), tries: S.shakeTries,
      hes: S.hesitations.map(Math.round), casts: S.casts.map((c) => c.bin),
      idle: r.idle, hidden: r.hidden,
      throws: S.throws.map((t) => t.v + (t.kept ? '' : '~')), doubt: r.doubted, total: Math.round(totalMs),
    };
  }

  // 留给“大师记得你”的一条：起完了卦才记
  function memory(endKey) {
    const c = lastCast();
    if (!c) return null;
    lastVisit = { no: c.hex.no, name: c.hex.name, ending: db.endings[endKey].name, at: new Date().toISOString() };
    return lastVisit;
  }

  function onEnd({ endKey, seed, ledgerData: data, got }) {
    const { totalMs, portrait } = fin;
    const c = lastCast();
    const nMoving = c ? c.lines.filter((l) => isMoving(l.v)).length : 0;
    const notes = ledgerNotes(view(), { domain: S.domain && db.domains[S.domain], totalMs, portrait, nMoving });
    S.end = { endKey, totalMs, seed, fields: Object.keys(data).length, notes, got, who: portrait.who };
  }

  // 结局坦白：旁批里的数字是怎么算出来的
  function confessItems() {
    const items = [];
    const { sure, recast } = S.reads;
    if (sure) items.push({ text: `我说有 ${sure.pct}% 的把握猜中你，是因为${sure.reason}。` });
    if (recast) items.push({ text: `我猜你 ${recast.pct}% 会再起一卦，因为${recast.reason}。` });
    if (S.portrait) items.push({ text: `我说你是“${S.portrait.who}”，把握 ${Math.round(S.portrait.conf * 100)}%——${S.portrait.why}。` });
    const c = lastCast();
    if (c) items.push({ text: `至于“${c.hex.name}”这一卦：${c.hex.machine}` });
    const prev = S.prevVisit;
    if (prev) items.push({ text: `${ctx.daysAgo(prev.at)}你来过，得的是“${prev.name}”，结局是“${prev.ending}”。你以为关掉页面我就忘了——我一直记得。` });
    return items;
  }

  function ledgerRows() {
    const e = S.end;
    if (!e) return [];
    const h = S.hesitations;
    const c = lastCast();
    const rows = [
      ['来访时辰', `设备时钟 ${S.clock.toTimeString().slice(0, 5)}`],
      ['设备', ctx.coarse ? '移动端，触屏' : '桌面端，鼠标'],
      ['问的方向', S.domain ? db.domains[S.domain].name : '未选'],
      ['你写的问题', S.question ? `${[...S.question].length} 字，原文没有离开你的设备` : '未写'],
      ['选方向用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
      ['摇卦', S.shakeTries ? `${sec(S.shakeMs)} 秒，${S.shakeTries} 次` : '—'],
      ['得卦', c ? `${c.hex.name}（${c.bin}）${c.changed ? `，变卦${c.changed.name}` : '，无变爻'}` : '—'],
      ...S.casts.map((cc, i) => [`第${'一二三四五六七八九'[i] ?? i + 1}卦的掷法`, castsRecord(cc)]),
      ['每爻掷前犹豫', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
      ['重起卦', `${Math.max(0, S.casts.length - 1)} 次`],
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
    const { seed } = S.end;
    const ending = db.endings[S.end.endKey];
    const c = lastCast();
    const now = new Date();
    const blob = await drawPoster({
      hex: { name: c.hex.name, upper: c.hex.upper, lower: c.hex.lower, ci: c.hex.ci, lines: c.lines.map((l) => l.v) },
      changed: c.changed ? { name: c.changed.name, lines: afterChange(c.lines.map((l) => l.v)) } : null,
      bits: c.bin,
      record: c.lines.map((l, i) => `${CN_YAO[i][0]}${YAO[l.v].name}${l.v}`).join('  '),
      ending,
      throws: S.throws,
      seed,
      date: `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`,
    }, posterSpec);
    gloss(G.poster);
    return { blob, name: `演算天机-${c.hex.name}.png` };
  }

  /* ───────── 回卷首 / 再来一局 ───────── */
  function resetAll({ clear = true } = {}) {
    timers.forEach(clearTimeout);
    timers = [];
    shake.holdEnd();
    ui.posterOpen = false;
    if (clear) { ctx.clearGloss(); ctx.fx.clear(); }
    ctx.el.huaxin.classList.remove('is-broken');
    ctx.resetRound();
    fin = null;
    Object.assign(S, freshState());
  }

  function toStart() {
    shell?.stop();
    resetAll();
    ctx.show('title');
    bootTitle();
  }

  function again() {
    const visits = ctx.visits.bump();
    resetAll({ clear: false });
    gloss(G.visits(visits));
    enterDing();
  }

  bootTitle();

  const game = {
    S,
    db,
    shake,
    // 屏要用的
    begin, pickDomain, confirmDing, attachShell, registerCast, toJie, accept, recast, again, toStart, settle,
    confessItems, ledgerRows, lastCast, bitOf,
    // 公共层要用的（接口见 src/juan/index.js）
    attitude, ledgerData, memory, onEnd, finish, makePoster,
    canDoubt: () => RITUAL.includes(ctx.screen), // 在问事、起卦、解卦时可以存疑
    busy: () => shake.holding || (ctx.screen === 'cast' && !!shell?.active) || S.rolling,
    canOracle: () => false, // 本卷不接通灵
    askOracle: () => {},
    get posterOpen() { return ui.posterOpen; },
    set posterOpen(v) { ui.posterOpen = v; },
    destroy() {
      timers.forEach(clearTimeout);
      shake.destroy();
      shell?.stop();
    },
  };
  return game;
}
