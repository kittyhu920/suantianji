import { castJiao, modelJiao, CUP_NAMES, CUP_SHORT, CUP_LABELS } from './jiao.js';
import { hashString, trueRandom } from './rng.js';
import { weave } from './loom.js';
import { drawPoster } from './poster.js';
import * as sfx from './audio.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? Math.min(ms, 60) : ms));
const sec = (ms) => (ms / 1000).toFixed(1);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式下忽略 */ } },
};

let db;
let S; // 本局状态

function freshState() {
  const now = new Date();
  const branchIdx = Math.floor(((now.getHours() + 1) % 24) / 2); // 23:00 起为子时
  return {
    screen: 'title',
    t0: performance.now(),
    clock: now,
    branch: db.branches[branchIdx],
    domain: null,
    question: '',
    sign: null,
    cups: [],
    throws: [],
    pending: null,
    rerolls: 0,
    doubt: false,
    doubtShown: false,
    idle: 0,
    hidden: 0,
    lastActive: performance.now(),
    idleFlagged: false,
    dingEnterAt: 0,
    pickMs: null,
    shakeMs: 0,
    shakeTries: 0,
    hesitations: [],
    readyAt: 0,
    oracleSent: false,
    claims: [], // 旁批里报给玩家的百分比，结局时坦白是编的
    finished: false,
  };
}

/* ───────── 机器旁批 ───────── */
const margin = $('margin');
const glossQueue = [];
let glossBusy = false;

function gloss(text, { alarm = false } = {}) {
  glossQueue.push({ text, alarm });
  if (!glossBusy) drainGloss();
}
async function drainGloss() {
  glossBusy = true;
  while (glossQueue.length) {
    const { text, alarm } = glossQueue.shift();
    margin.querySelectorAll('.gloss.is-new').forEach((n) => n.classList.remove('is-new'));
    const el = document.createElement('p');
    el.className = 'gloss is-new' + (alarm ? ' is-alarm' : '');
    el.style.margin = '0';
    margin.prepend(el);
    while (margin.children.length > 6) margin.lastElementChild.remove();
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = '▍';
    el.append(caret);
    for (const ch of text) {
      caret.before(ch);
      await sleep(38);
    }
    caret.remove();
    await sleep(220);
  }
  glossBusy = false;
}

/* ───────── 屏幕切换 ───────── */
function show(name) {
  S.screen = name;
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === name));
  $('stage').scrollTop = 0;
  touch();
  const inRitual = name === 'ding' || name === 'qian' || name === 'jiao';
  $('btn-doubt').hidden = !(inRitual && S.doubtShown);
}

function touch() {
  S.lastActive = performance.now();
  S.idleFlagged = false;
}

function revealDoubt() {
  if (S.doubtShown) return;
  S.doubtShown = true;
  gloss('不信我，就按左下角那枚印');
  if (['ding', 'qian', 'jiao'].includes(S.screen)) $('btn-doubt').hidden = false;
}

/* ───────── 入卷 ───────── */
// 上一局的记录，只存在玩家本机
let lastVisit = store.get('stj-last', null);

function daysAgo(iso) {
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? '今天早些时候' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}

// 来访次数按"真的开始求签"计，刷新页面不算
function bootTitle() {
  const visits = store.get('stj-visits', 0) + 1;
  const coarse = matchMedia('(pointer: coarse)').matches;
  gloss('我开始留意你了');
  gloss(`你用的是${coarse ? '手机' : '电脑'}`);
  if (visits > 1) gloss(`你第 ${visits} 次来找我了`);
  if (lastVisit) gloss(`${daysAgo(lastVisit.at)}你抽到的是${lastVisit.name}`);
}

$('btn-enter').addEventListener('click', () => {
  store.set('stj-visits', store.get('stj-visits', 0) + 1);
  sfx.initAudio();
  sfx.startDrone();
  sfx.bronze(330, 2.2, 0.14);
  enterDing();
});

$('btn-mute').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', String(on));
  e.currentTarget.setAttribute('aria-label', on ? '取消静音' : '静音');
  sfx.setMuted(on);
});

/* ───────── 定盘 ───────── */
function enterDing() {
  show('ding');
  S.dingEnterAt = performance.now();
  const { zhi, el } = S.branch;
  const hh = String(S.clock.getHours()).padStart(2, '0');
  const mm = String(S.clock.getMinutes()).padStart(2, '0');
  const from = (db.branches.indexOf(S.branch) * 2 + 23) % 24;
  $('shichen').innerHTML = `现在是<b>${zhi}时</b>（${from}–${(from + 2) % 24} 点），五行属${el}`;
  gloss(`我看了你的时间：${zhi}时 ${hh}:${mm}`);
  gloss(`我按时辰动了签筒的概率`);

  const slips = $('slips');
  slips.replaceChildren();
  for (const [key, d] of Object.entries(db.domains)) {
    const b = document.createElement('button');
    b.className = 'slip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset.key = key;
    b.innerHTML = `<span class="slip-name">${d.name}</span><span class="slip-desc">${d.desc.replaceAll(' · ', '　')}</span>`;
    b.addEventListener('click', () => pickDomain(key));
    slips.append(b);
  }
  $('ask').value = '';
  $('btn-ding').disabled = true;
}

function pickDomain(key) {
  sfx.clack(0.6);
  S.domain = key;
  if (S.pickMs == null) S.pickMs = performance.now() - S.dingEnterAt;
  $('slips').querySelectorAll('.slip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.key === key)));
  $('btn-ding').disabled = false;
  const d = db.domains[key];
  gloss(`你问${d.name}，想了 ${sec(S.pickMs)} 秒，${d.persona}`);
}

function questionMood(q) {
  if (/该不该|要不要|能不能|会不会|是否/.test(q)) return '犹豫';
  if (/为什么|怎么|如何/.test(q)) return '困惑';
  return '期待';
}

$('btn-ding').addEventListener('click', () => {
  S.question = $('ask').value.trim().slice(0, 40);
  if (S.question) gloss(`你写了 ${[...S.question].length} 个字，我读出了${questionMood(S.question)}`);
  sfx.bronze(392, 1.6, 0.12);
  enterQian();
});

/* ───────── 摇签 ───────── */
const tube = $('tube');
let shaking = false;
let shakeStart = 0;
let clackTimer = 0;
let autoDrop = 0;

function enterQian() {
  show('qian');
  tube.classList.remove('is-done', 'is-shaking');
  $('fallen').classList.remove('is-falling');
  $('sign').hidden = true;
  $('qian-note').textContent = '按住签筒摇一摇，松手就会掉出一支签。手机也可以直接晃。';
  $('tube-wrap').hidden = false;
}

function startShake() {
  if (shaking || S.sign) return;
  touch();
  shaking = true;
  shakeStart = performance.now();
  tube.classList.add('is-shaking');
  const loop = () => {
    if (!shaking) return;
    sfx.clack(0.5 + Math.random() * 0.5);
    clackTimer = setTimeout(loop, 45 + Math.random() * 90);
  };
  loop();
  autoDrop = setTimeout(endShake, 4500);
}

function endShake() {
  if (!shaking) return;
  shaking = false;
  clearTimeout(clackTimer);
  clearTimeout(autoDrop);
  tube.classList.remove('is-shaking');
  const dur = performance.now() - shakeStart;
  S.shakeMs += dur;
  S.shakeTries += 1;
  touch();
  if (dur < 900) {
    $('qian-note').textContent = '再多摇一会儿，签才会掉出来。';
    return;
  }
  dropSign();
}

function pickSign() {
  const el = S.branch.el;
  const weights = db.signs.map((s) => (s.el === el ? 2 : 1));
  let r = trueRandom() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < db.signs.length; i++) {
    r -= weights[i];
    if (r <= 0) return db.signs[i];
  }
  return db.signs[db.signs.length - 1];
}

// 0–69 的中文数字：十一、二十、六十……
const DIGITS = '零一二三四五六七八九';
const CN_NUM = Array.from({ length: 70 }, (_, n) => (n < 10 ? DIGITS[n]
  : `${n >= 20 ? DIGITS[Math.floor(n / 10)] : ''}十${n % 10 ? DIGITS[n % 10] : ''}`));

// 签头（no 为 0）不属干支，显示为"签头"
const signNo = (sign) => (sign.no ? `第${CN_NUM[sign.no]}签` : '签头');
const signFull = (sign) => [signNo(sign), sign.gz, sign.nayin].filter(Boolean).join(' · ');
const DISAPPOINT = { '上上': 0.08, '上吉': 0.21, '中平': 0.47, '下': 0.71, '下下': 0.89 };

async function dropSign() {
  const sign = pickSign();
  S.sign = sign;
  gloss(`你摇了 ${sec(S.shakeMs)} 秒，试了 ${S.shakeTries} 次`);
  $('fallen-no').textContent = signNo(sign);
  $('fallen').classList.add('is-falling');
  tube.classList.add('is-done');
  await sleep(1100);
  sfx.thud();
  await sleep(500);
  renderSign(sign);
  $('tube-wrap').hidden = true;
  $('qian-note').textContent = '';
  const p = Math.min(0.97, DISAPPOINT[sign.level] + (trueRandom() - 0.5) * 0.06);
  S.claims.push(`${Math.round(p * 100)}% 会失望`);
  gloss(`${sign.level}签，我猜你 ${Math.round(p * 100)}% 会失望`, { alarm: p > 0.6 });
  if (lastVisit?.name === sign.name) gloss('又是这支签。我记得');
  if (sign.el === S.branch.el) gloss(`这支签属${sign.el}，我替你加过分`);
}

function renderSign(sign) {
  $('sign-no').textContent = signFull(sign);
  $('sign-name').textContent = sign.name;
  const lv = $('sign-level');
  lv.textContent = sign.level;
  lv.dataset.tone = db.levels[sign.level];
  $('sign-bai').textContent = sign.bai;
  $('sign-poem').replaceChildren(...sign.poem.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
  $('sign').hidden = false;
}

tube.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tube.setPointerCapture?.(e.pointerId);
  requestMotion();
  startShake();
});
tube.addEventListener('pointerup', endShake);
tube.addEventListener('pointercancel', endShake);
tube.addEventListener('contextmenu', (e) => e.preventDefault());
tube.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startShake(); }
});
tube.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endShake(); }
});

// 手机晃动：iOS 需要在手势内申请权限
let motionAsked = false;
let motionQuiet = 0;
function requestMotion() {
  if (motionAsked || typeof DeviceMotionEvent === 'undefined') return;
  motionAsked = true;
  const listen = () => window.addEventListener('devicemotion', onMotion);
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().then((s) => s === 'granted' && listen()).catch(() => {});
  } else listen();
}
function onMotion(e) {
  if (S.screen !== 'qian' || S.sign) return;
  const a = e.acceleration || e.accelerationIncludingGravity;
  if (!a) return;
  const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
  const threshold = e.acceleration ? 12 : 22;
  if (mag > threshold) {
    startShake();
    clearTimeout(motionQuiet);
    motionQuiet = setTimeout(endShake, 450);
  }
}

$('btn-to-jiao').addEventListener('click', enterJiao);

/* ───────── 掷筊 ───────── */
const jiaoEl = $('jiao');
const jiaoRot = [0, 0];

function buildJiao() {
  jiaoEl.replaceChildren();
  for (let i = 0; i < 2; i++) {
    const c = document.createElement('div');
    c.className = `jiao-block${i ? ' is-right' : ''}`;
    c.innerHTML = `<div class="jiao-body">
      <div class="jiao-face front"><svg viewBox="0 0 120 60"><use href="#jiao-ping"/></svg></div>
      <div class="jiao-face back"><svg viewBox="0 0 120 60"><use href="#jiao-tu"/></svg></div>
    </div>`;
    jiaoEl.append(c);
  }
}

function renderCups() {
  const list = $('cups');
  list.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const li = document.createElement('li');
    const cup = S.cups[i] || (i === S.cups.length ? S.pending : null);
    const kind = cup?.kind;
    li.className = `cup ${S.cups[i] ? 'is-set' : cup ? 'is-pending' : ''} ${kind ? `is-${kind}` : ''}`;
    li.innerHTML = `<span class="cup-tag">${i === 0 ? '我替你掷' : '你来掷'}</span><span class="cup-name">${CUP_LABELS[i]}</span><span class="cup-kind">${kind ? CUP_NAMES[kind] : '　　'}</span>`;
    list.append(li);
  }
}

async function tossJiao(res, dur = 1250) {
  const blocks = [...jiaoEl.children];
  blocks.forEach((c, i) => {
    const body = c.firstElementChild;
    const face = res.flat[i] ? 0 : 180;
    const spins = 2 + Math.floor(trueRandom() * 3);
    jiaoRot[i] = Math.ceil(jiaoRot[i] / 360) * 360 + spins * 360 + face;
    body.style.transitionDuration = `${dur}ms`;
    c.style.animationDuration = `${dur}ms`;
    c.classList.remove('is-tossing');
    void c.offsetWidth;
    c.classList.add('is-tossing');
    body.style.transform = `rotateX(${jiaoRot[i]}deg)`;
    setTimeout(() => sfx.clack(0.9), reducedMotion ? 0 : dur - 90 + i * 70);
  });
  await sleep(dur + 120);
  sfx.thud();
  [...$('jiao-labels').children].forEach((l, i) => { l.textContent = res.flat[i] ? '平面朝上' : '凸面朝上'; });
}

const CUP_DESC = {
  sheng: '一平一凸，是圣杯：神明同意。',
  xiao: '两面都平，是笑杯：神明没说清，再掷一次。',
  yin: '两面都凸，是<em>阴杯</em>：神明不同意这支签。',
};

async function enterJiao() {
  show('jiao');
  S.cups = [];
  S.throws = [];
  S.pending = null;
  buildJiao();
  [...$('jiao-labels').children].forEach((l) => { l.textContent = ''; });
  renderCups();
  ['btn-throw', 'btn-accept', 'btn-reroll'].forEach((id) => { $(id).hidden = true; });
  $('jiao-note').textContent = '第一次，我照你刚才的样子替你掷。';
  $('jiao-result').textContent = '';
  gloss('第一杯我替你掷，照我对你的了解');

  const cup = modelJiao();
  await tossJiao(cup, 900);
  S.cups.push({ ...cup, by: 'model' });
  S.throws.push({ kind: cup.kind, cup: 0, by: 'model', kept: true });
  renderCups();
  $('jiao-result').innerHTML = `第一杯：${CUP_DESC.sheng}`;
  await sleep(700);
  const sure = Math.round((0.8 + trueRandom() * 0.15) * 100);
  S.claims.push(`${sure}% 的把握`);
  gloss(`我有 ${sure}% 的把握猜中你`);
  $('jiao-note').textContent = '第二、三次由你自己掷。对结果不满意，可以点“不服，再掷”。';
  readyToThrow();
}

function readyToThrow({ again = false } = {}) {
  S.readyAt = performance.now();
  touch();
  $('btn-throw').textContent = again ? '再掷一次' : '掷筊';
  $('btn-throw').hidden = false;
  $('btn-throw').disabled = false;
  $('btn-accept').hidden = true;
  $('btn-reroll').hidden = true;
  $('btn-throw').focus({ preventScroll: true });
}

// again：笑杯之后按规矩再掷，不算"不服"
async function playerThrow({ reroll = false, again = false } = {}) {
  const idx = S.cups.length;
  if (!reroll && !again) {
    [...$('jiao-labels').children].forEach((l) => { l.textContent = ''; });
    const h = performance.now() - S.readyAt;
    S.hesitations.push(h);
    gloss(`${CUP_LABELS[idx]}，你犹豫了 ${sec(h)} 秒`);
  }
  touch();
  ['btn-throw', 'btn-accept', 'btn-reroll'].forEach((id) => { $(id).disabled = true; });
  const cup = castJiao();
  S.pending = cup;
  await tossJiao(cup);
  S.throws.push({ kind: cup.kind, cup: idx, by: 'you', kept: false });
  renderCups();
  $('jiao-result').innerHTML = `${CUP_LABELS[idx]}：${CUP_DESC[cup.kind]}`;
  if (cup.kind === 'xiao') {
    readyToThrow({ again: true });
    return;
  }
  if (cup.kind === 'yin') gloss('阴杯，和我猜的不一样', { alarm: true });
  $('btn-throw').hidden = true;
  $('btn-accept').hidden = false;
  $('btn-reroll').hidden = false;
  $('btn-accept').disabled = false;
  $('btn-reroll').disabled = false;
  S.readyAt = performance.now();
}

$('btn-throw').addEventListener('click', () => playerThrow({ again: S.pending?.kind === 'xiao' }));

$('btn-reroll').addEventListener('click', () => {
  S.rerolls++;
  gloss(`你不服，我记下了 ×${S.rerolls}`, { alarm: true });
  if (S.rerolls === 3) gloss('我越来越懂你了……');
  revealDoubt();
  playerThrow({ reroll: true });
});

$('btn-accept').addEventListener('click', () => {
  const cup = S.pending;
  S.cups.push({ ...cup, by: 'you' });
  S.throws[S.throws.length - 1].kept = true;
  S.pending = null;
  renderCups();
  touch();
  // 阴杯即神明不允，这支签到此为止
  if (cup.kind === 'yin' || S.cups.length === 3) finish();
  else readyToThrow();
});

/* ───────── 存疑 ───────── */
$('btn-doubt').addEventListener('click', async () => {
  if (S.finished) return;
  S.doubt = true;
  $('btn-doubt').hidden = true;
  $('huaxin').classList.add('is-broken');
  gloss('你打断了我', { alarm: true });
  gloss('你不想被我算');
  sfx.bronze(220, 2.6, 0.16);
  await sleep(1600);
  $('huaxin').classList.remove('is-broken');
  finish();
});

/* ───────── 观象 ───────── */
function persona() {
  const h = S.hesitations;
  const avg = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
  if (S.rerolls >= 2) return '执念型';
  if (avg > 3500 || S.idle >= 1) return '犹疑型';
  if ((S.pickMs ?? 9e9) < 2500 && avg < 1500) return '果决型';
  return '随性型';
}

function decideEnding() {
  if (S.doubt) return 'po';
  if (S.rerolls >= 3) return 'mi';
  return S.cups.some((c) => c.by === 'you' && c.kind === 'yin') ? 'ni' : 'zun';
}

// 这支签作不作数
function signState() {
  if (S.cups.some((c) => c.kind === 'yin')) return { key: 'no', text: '掷出了阴杯：神明不同意，这支签只能当参考。' };
  if (S.cups.length === 3) return { key: 'yes', text: '三次都是圣杯：这支签算数。' };
  return { key: 'open', text: S.cups.length ? `你在${CUP_LABELS[S.cups.length]}前停下了，这支签还没定。` : '还没掷筊，这支签还没定。' };
}

// 每一杯的全部掷法，例如"圣 / 笑→阴→圣 / 圣"
function cupsRecord() {
  return [0, 1, 2]
    .map((i) => S.throws.filter((t) => t.cup === i).map((t) => CUP_SHORT[t.kind]).join('→'))
    .filter(Boolean)
    .join(' / ');
}

// 结局时大师坦白：第一杯是安排好的，百分比是编的，这支签的暗面
function renderConfess() {
  const items = [];
  if (S.throws.some((t) => t.by === 'model')) {
    items.push('第一杯是我替你掷的。它从来都是圣杯——我给你的，永远是你会点头的东西。');
  }
  if (S.claims.length) {
    items.push(`我说的${S.claims.map((c) => `“${c}”`).join('、')}，都是随口编的。数字一出口，你就信了几分。`);
  }
  if (S.sign) items.push(`至于这支签：${S.sign.machine}`);
  if (lastVisit) {
    items.push(`${daysAgo(lastVisit.at)}你来过，抽到“${lastVisit.name}”，得了“${lastVisit.ending}”。你以为关掉页面我就忘了——我一直记得。`);
  }
  $('confess-box').hidden = !items.length;
  $('confess').replaceChildren(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
}

function renderJieqian(state) {
  const box = $('jieqian');
  box.hidden = !S.sign;
  if (!S.sign) return;
  const sign = S.sign;
  const d = db.domains[S.domain];
  $('jq-state').textContent = state.text;
  $('jq-state').dataset.state = state.key;
  $('jq-name').textContent = `${signNo(sign)}　${sign.name}`;
  $('jq-level').textContent = sign.level;
  $('jq-level').dataset.tone = db.levels[sign.level];
  $('jq-bai').textContent = sign.bai;
  $('jq-advice-h').textContent = `关于${d.desc}`;
  $('jq-advice').textContent = sign.advice[S.domain];
}

async function finish() {
  if (S.finished) return;
  S.finished = true;
  const endKey = decideEnding();
  const ending = db.endings[endKey];
  const tone = S.sign ? db.levels[S.sign.level] : 'ping';
  const totalMs = performance.now() - S.t0;
  const who = persona();
  const events = 4 + S.hesitations.length + S.rerolls + S.idle + S.shakeTries + (S.question ? 1 : 0);
  const conf = Math.min(0.97, 0.52 + events * 0.035 + trueRandom() * 0.06);
  const state = signState();

  const ledgerData = {
    branch: S.branch.zhi, clock: S.clock.toTimeString().slice(0, 5),
    device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    domain: S.domain, qlen: [...S.question].length, pick: Math.round(S.pickMs ?? -1),
    shake: Math.round(S.shakeMs), tries: S.shakeTries, sign: S.sign?.no ?? 0,
    hes: S.hesitations.map(Math.round), rerolls: S.rerolls, idle: S.idle, hidden: S.hidden,
    throws: S.throws.map((t) => t.kind + (t.kept ? '' : '~')), doubt: S.doubt, total: Math.round(totalMs),
  };
  const seed = hashString(JSON.stringify(ledgerData)) % 4294967296;

  gloss(`你是${who}，把握 ${Math.round(conf * 100)}%`);
  show('end');
  $('btn-doubt').hidden = true;

  // 解签
  renderJieqian(state);
  $('cups-pair').innerHTML = S.cups.length
    ? S.cups.map((c) => CUP_NAMES[c.kind]).join(' · ')
    : `还没掷筊<small>${S.sign ? '签已抽出，但没有掷筊' : '还没抽签'}</small>`;

  // 结局
  $('e-seal').textContent = ending.name[0];
  $('e-name').textContent = ending.name;
  $('e-sub').textContent = ending.sub;
  $('e-lead').textContent = ending.lead[tone];
  $('e-verse').replaceChildren(...ending.verse.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
  $('e-critique').textContent = ending.critique;
  renderConfess();

  renderLedger(totalMs, who, conf, seed);
  if (S.sign) {
    lastVisit = { no: S.sign.no, name: S.sign.name, ending: ending.name, at: new Date().toISOString() };
    store.set('stj-last', lastVisit);
  }
  const got = new Set(store.get('stj-endings', []));
  got.add(endKey);
  store.set('stj-endings', [...got]);
  renderEndings(got, endKey);

  // 命盘
  const fields = Object.keys(ledgerData).length;
  $('loom-cap').textContent = S.throws.length
    ? `这幅图由你刚才的 ${fields} 项操作数据生成，每个人都不一样。编号 ${seed.toString(16).padStart(8, '0')}`
    : '一次也没掷，所以什么也没织出来。空白，也是一种回答。';
  weave($('loom'), { seed, throws: S.throws, reduced: reducedMotion });
  S.poster = { endKey, seed, state };

  sfx.bronze(262, 3.2, 0.16);
  S.oracleArgs = [endKey, who];
  if ($('oracle-mode').checked) askOracle(endKey, who);
  else offerOracle();
}

function renderLedger(totalMs, who, conf, seed) {
  const h = S.hesitations;
  const rows = [
    ['来访时辰', `${S.branch.zhi}时（设备时钟 ${S.clock.toTimeString().slice(0, 5)}）`],
    ['设备', matchMedia('(pointer: coarse)').matches ? '移动端，触屏' : '桌面端，鼠标'],
    ['问的方向', S.domain ? db.domains[S.domain].name : '未选'],
    ['你写的问题', S.question ? questionNote() : '未写'],
    ['选方向用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
    ['摇签', S.shakeTries ? `${sec(S.shakeMs)} 秒，${S.shakeTries} 次` : '—'],
    ['得签', S.sign ? `${signNo(S.sign)} ${S.sign.name}（${S.sign.level}）` : '—'],
    ['每次掷前犹豫', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
    ['重掷', `${S.rerolls} 次`],
    ['掷筊', S.throws.length ? cupsRecord() : '—'],
    ['静止超过八秒', `${S.idle} 次`],
    ['离开页面', `${S.hidden} 次`],
    ['总用时', `${Math.floor(totalMs / 60000)} 分 ${Math.round((totalMs % 60000) / 1000)} 秒`],
    ['我给你的画像', `${who}，置信 ${conf.toFixed(2)}`],
    ['图的编号', seed.toString(16).padStart(8, '0')],
  ];
  $('ledger').replaceChildren(...rows.flatMap(([k, v]) => [
    Object.assign(document.createElement('dt'), { textContent: k }),
    Object.assign(document.createElement('dd'), { textContent: v }),
  ]));
}

function renderEndings(got, current) {
  const list = $('endings-list');
  list.replaceChildren();
  for (const [key, e] of Object.entries(db.endings)) {
    const has = got.has(key);
    const li = document.createElement('li');
    li.className = `${has ? '' : 'is-locked'} ${key === current ? 'is-current' : ''}`;
    li.innerHTML = `<span class="seal" aria-hidden="true"><span>${e.name[0]}</span></span>
      <span><b>${e.name}·${e.sub}</b>${has ? (key === current ? '这一次' : '得到过') : e.hint}</span>`;
    list.append(li);
  }
}

// 没勾通灵模式的人，看完结果还能再请 AI 解签
function offerOracle() {
  $('oracle').hidden = !S.sign;
  $('oracle-text').hidden = true;
  $('oracle-ask').hidden = false;
  $('btn-oracle').disabled = false;
}

$('btn-oracle').addEventListener('click', () => {
  $('btn-oracle').disabled = true;
  askOracle(...S.oracleArgs);
});

const LIMITED = {
  ip: '你今天已经找我细说过好几回了，明天再来吧。上面的解签，就是这次的结果。',
  global: '今天来找我细说的人太多了，明天再来吧。上面的解签，就是这次的结果。',
};

async function askOracle(endKey, who) {
  const box = $('oracle');
  const p = $('oracle-text');
  box.hidden = false;
  p.hidden = false;
  $('oracle-ask').hidden = true;
  box.classList.add('is-loading');
  p.textContent = 'AI 正在帮你解签……';
  gloss('我把你的画像送去了云端');
  S.oracleSent = !!S.question;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000); // 白话解签较长，云端偶尔要十几秒
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        domain: S.domain ? db.domains[S.domain].name : '',
        question: S.question,
        sign: S.sign ? { name: S.sign.name, level: S.sign.level, poem: S.sign.poem, jie: S.sign.jie, bai: S.sign.bai } : null,
        cups: S.cups.map((c) => CUP_NAMES[c.kind]).join('、'), verdict: signState().text,
        ending: db.endings[endKey].name, persona: who,
      }),
    });
    if (res.status === 429) {
      S.oracleSent = false; // 限流在读请求体之前拦下，问题没有被读取
      const { scope } = await res.json().catch(() => ({}));
      p.textContent = LIMITED[scope] ?? LIMITED.global;
      gloss('云端没回话，以我的为准');
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data.text) throw new Error('empty');
    p.textContent = data.text;
    gloss('云端回话了');
  } catch {
    p.textContent = 'AI 暂时没有回应。上面的解签就是这次的结果。';
    gloss('云端没回话，以我的为准');
  } finally {
    clearTimeout(timer);
    box.classList.remove('is-loading');
    if (S.question) renderLedgerQuestionRow();
  }
}

function questionNote() {
  return `${[...S.question].length} 字，${S.oracleSent ? '我已把原文送去云端' : '原文没有离开你的设备'}`;
}

function renderLedgerQuestionRow() {
  const dts = [...$('ledger').querySelectorAll('dt')];
  const dt = dts.find((d) => d.textContent === '你写的问题');
  if (dt) dt.nextElementSibling.textContent = questionNote();
}

/* ───────── 分享图 ───────── */
let posterUrl = '';

$('btn-poster').addEventListener('click', async () => {
  const dlg = $('poster');
  const img = $('poster-img');
  dlg.hidden = false;
  img.hidden = true;
  $('poster-tip').hidden = true;
  ['poster-download', 'poster-share'].forEach((id) => { $(id).hidden = true; });
  $('poster-status').hidden = false;
  $('poster-close').focus();

  const { endKey, seed, state } = S.poster;
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
  });
  if (posterUrl) URL.revokeObjectURL(posterUrl);
  posterUrl = URL.createObjectURL(blob);
  img.src = posterUrl;
  img.hidden = false;
  $('poster-status').hidden = true;

  const name = `演算天机-${sign ? sign.name : ending.name}.png`;
  const coarse = matchMedia('(pointer: coarse)').matches;
  $('poster-tip').textContent = coarse ? '长按图片即可保存' : '也可以在图片上右键另存';
  $('poster-tip').hidden = false;
  const dl = $('poster-download');
  dl.href = posterUrl;
  dl.download = name;
  dl.hidden = coarse;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    const btn = $('poster-share');
    btn.hidden = false;
    btn.onclick = () => navigator.share({ files: [file], title: '演算天机' }).catch(() => {});
  }
  gloss('你想把我给的命带走');
});

$('poster-close').addEventListener('click', () => { $('poster').hidden = true; });
$('poster').addEventListener('click', (e) => { if (e.target === $('poster')) $('poster').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('poster').hidden = true; });

$('btn-again').addEventListener('click', () => {
  const visits = store.get('stj-visits', 0) + 1;
  store.set('stj-visits', visits);
  S = freshState();
  gloss(`你又来问了，第 ${visits} 次`);
  enterDing();
});

/* ───────── 全局观测 ───────── */
['pointerdown', 'keydown', 'input'].forEach((t) => document.addEventListener(t, () => {
  if (S) touch();
}, { passive: true }));

document.addEventListener('visibilitychange', () => {
  if (!S || S.screen === 'title' || S.finished) return;
  if (document.visibilityState === 'visible') {
    S.hidden++;
    gloss('你走开了一会儿，我记下了');
  }
});

setInterval(() => {
  if (!S || S.finished || S.idleFlagged || shaking) return;
  if (!['ding', 'qian', 'jiao'].includes(S.screen)) return;
  if (performance.now() - S.lastActive > 8000) {
    S.idleFlagged = true;
    S.idle++;
    gloss('你停了八秒，我记为犹豫');
    revealDoubt();
  }
}, 1000);

/* ───────── 启动 ───────── */
(async function boot() {
  try {
    db = await (await fetch('data/fortune-db.json')).json();
  } catch {
    $('enter-note').textContent = '签簿未能载入。请通过本地服务器或线上地址打开本页。';
    $('btn-enter').disabled = true;
    return;
  }
  S = freshState();
  bootTitle();
})();
