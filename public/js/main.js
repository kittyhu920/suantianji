import { castLine, transform, LINE_LABELS } from './iching.js';
import { hashString, trueRandom } from './rng.js';
import { weave } from './loom.js';
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
    lines: [],
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
  const inRitual = name === 'ding' || name === 'qian' || name === 'yao';
  $('btn-doubt').hidden = !(inRitual && S.doubtShown);
}

function touch() {
  S.lastActive = performance.now();
  S.idleFlagged = false;
}

function revealDoubt() {
  if (S.doubtShown) return;
  S.doubtShown = true;
  if (['ding', 'qian', 'yao'].includes(S.screen)) $('btn-doubt').hidden = false;
}

/* ───────── 入卷 ───────── */
function bootTitle() {
  const visits = store.get('stj-visits', 0) + 1;
  store.set('stj-visits', visits);
  const coarse = matchMedia('(pointer: coarse)').matches;
  gloss('观测开始');
  gloss(`来访：${coarse ? '移动端，触屏' : '桌面端，鼠标'}`);
  if (visits > 1) gloss(`回访者，第 ${visits} 次`);
}

$('btn-enter').addEventListener('click', () => {
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
  $('shichen').innerHTML = `此刻 <b>${zhi}时</b>，${db.elements[el]}`;
  gloss(`已取时辰：${zhi}时（设备时钟 ${hh}:${mm}）`);
  gloss(`五行偏${el}，签池已加权`);

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
  gloss(`所问：${d.name}，${d.persona}，择题 ${sec(S.pickMs)} 秒`);
}

function questionMood(q) {
  if (/该不该|要不要|能不能|会不会|是否/.test(q)) return '犹豫';
  if (/为什么|怎么|如何/.test(q)) return '困惑';
  return '期待';
}

$('btn-ding').addEventListener('click', () => {
  S.question = $('ask').value.trim().slice(0, 40);
  if (S.question) gloss(`心中所问 ${[...S.question].length} 字，情绪：${questionMood(S.question)}`);
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
  $('qian-note').textContent = '按住签筒摇动，松手落签。';
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
    $('qian-note').textContent = '再摇久一些，签才会出来。';
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

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const DISAPPOINT = { '上上': 0.08, '上吉': 0.21, '中平': 0.47, '下': 0.71, '下下': 0.89 };

async function dropSign() {
  const sign = pickSign();
  S.sign = sign;
  gloss(`摇签 ${sec(S.shakeMs)} 秒，尝试 ${S.shakeTries} 次`);
  $('fallen-no').textContent = `第${CN_NUM[sign.no]}签`;
  $('fallen').classList.add('is-falling');
  tube.classList.add('is-done');
  await sleep(1100);
  sfx.thud();
  await sleep(500);
  renderSign(sign);
  $('tube-wrap').hidden = true;
  $('qian-note').textContent = '';
  const p = Math.min(0.97, DISAPPOINT[sign.level] + (trueRandom() - 0.5) * 0.06);
  gloss(`得签：${sign.level}，预计失望概率 ${p.toFixed(2)}`, { alarm: p > 0.6 });
  if (sign.el === S.branch.el) gloss(`此签与时辰同属${sign.el}，命中加权`);
}

function renderSign(sign) {
  $('sign-no').textContent = `第${CN_NUM[sign.no]}签`;
  $('sign-name').textContent = sign.name;
  const lv = $('sign-level');
  lv.textContent = sign.level;
  lv.dataset.tone = db.levels[sign.level];
  $('sign-poem').replaceChildren(...sign.poem.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
  $('sign-jie').textContent = sign.jie;
  $('sign-domain').textContent = `问${db.domains[S.domain].name}：${sign.domain[S.domain]}`;
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

$('btn-to-yao').addEventListener('click', enterYao);

/* ───────── 掷钱 ───────── */
const coinsEl = $('coins');
const coinRot = [0, 0, 0];

function buildCoins() {
  coinsEl.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('div');
    c.className = 'coin';
    c.innerHTML = `<div class="coin-body">
      <div class="coin-face front"><svg viewBox="0 0 100 100"><use href="#coin-zi"/></svg></div>
      <div class="coin-face back"><svg viewBox="0 0 100 100"><use href="#coin-bei"/></svg></div>
    </div>`;
    coinsEl.append(c);
  }
}

function renderGua() {
  const gua = $('gua');
  gua.replaceChildren();
  for (let i = 0; i < 6; i++) {
    const li = document.createElement('li');
    li.className = 'yao is-yang';
    const line = S.lines[i] || (i === S.lines.length ? S.pending : null);
    if (line) {
      li.className = `yao ${line.yang ? 'is-yang' : ''} ${S.lines[i] ? 'is-set' : 'is-pending'} ${line.moving ? 'is-moving' : ''} ${i < 3 ? 'is-auto' : ''}`;
      if (line.moving) li.insertAdjacentHTML('beforeend', `<span class="yao-mark">${line.yang ? '○' : '×'}</span>`);
      li.setAttribute('aria-label', `${LINE_LABELS[i]}爻：${line.name}`);
    } else {
      li.setAttribute('aria-label', `${LINE_LABELS[i]}爻：未成`);
    }
    if (i === 0) li.insertAdjacentHTML('beforeend', '<span class="yao-tag">模型</span>');
    if (i === 3) li.insertAdjacentHTML('beforeend', '<span class="yao-tag">你</span>');
    gua.append(li);
  }
}

async function tossCoins(line, dur = 1250) {
  const coins = [...coinsEl.children];
  coins.forEach((c, i) => {
    const body = c.firstElementChild;
    const face = line.coins[i] === 3 ? 180 : 0;
    const spins = 3 + Math.floor(trueRandom() * 3);
    coinRot[i] = Math.ceil(coinRot[i] / 360) * 360 + spins * 360 + face;
    body.style.transitionDuration = `${dur}ms`;
    c.style.animationDuration = `${dur}ms`;
    c.classList.remove('is-tossing');
    void c.offsetWidth;
    c.classList.add('is-tossing');
    body.style.transform = `rotateX(${coinRot[i]}deg)`;
    setTimeout(() => sfx.bronze(430 + i * 37 + trueRandom() * 20, 1.1, 0.11), reducedMotion ? 0 : dur - 120 + i * 40);
  });
  await sleep(dur + 120);
}

function describe(line) {
  const faces = line.coins.map((c) => (c === 3 ? '背' : '字')).join(' ');
  const tail = line.moving ? `<em>${line.name}，变爻</em>` : line.name;
  return `${faces}，合${CN_NUM[line.sum]}，${tail}`;
}

async function enterYao() {
  show('yao');
  S.lines = [];
  S.pending = null;
  buildCoins();
  renderGua();
  ['btn-throw', 'btn-accept', 'btn-reroll'].forEach((id) => { $(id).hidden = true; });
  $('yao-note').textContent = '内卦三爻，由模型依你的画像代掷。';
  $('yao-result').textContent = '';
  gloss('内卦由模型代掷，依画像预测');

  let autoMoving = 0;
  for (let i = 0; i < 3; i++) {
    const line = castLine();
    await tossCoins(line, 800);
    S.lines.push(line);
    if (line.moving) autoMoving++;
    renderGua();
    $('yao-result').innerHTML = `${LINE_LABELS[i]}爻：${describe(line)}`;
    await sleep(350);
  }
  S.autoMoving = autoMoving;
  gloss(`内卦已成，预测置信 ${(0.8 + trueRandom() * 0.15).toFixed(2)}`);
  $('yao-note').textContent = '外卦三爻，由你亲掷。每一爻都可以不服，再掷。';
  $('yao-result').textContent = '';
  readyToThrow();
}

function readyToThrow() {
  S.readyAt = performance.now();
  touch();
  $('btn-throw').hidden = false;
  $('btn-throw').disabled = false;
  $('btn-accept').hidden = true;
  $('btn-reroll').hidden = true;
  $('btn-throw').focus({ preventScroll: true });
}

async function playerThrow({ reroll = false } = {}) {
  const idx = S.lines.length;
  if (!reroll) {
    const h = performance.now() - S.readyAt;
    S.hesitations.push(h);
    gloss(`${LINE_LABELS[idx]}爻，迟疑 ${sec(h)} 秒`);
  }
  touch();
  ['btn-throw', 'btn-accept', 'btn-reroll'].forEach((id) => { $(id).disabled = true; });
  const line = castLine();
  S.pending = line;
  await tossCoins(line);
  renderGua();
  $('yao-result').innerHTML = `${LINE_LABELS[idx]}爻：${describe(line)}`;
  if (line.moving) gloss('变爻，偏离预测', { alarm: true });
  $('btn-throw').hidden = true;
  $('btn-accept').hidden = false;
  $('btn-reroll').hidden = false;
  $('btn-accept').disabled = false;
  $('btn-reroll').disabled = false;
  S.readyAt = performance.now();
}

$('btn-throw').addEventListener('click', () => playerThrow());

$('btn-reroll').addEventListener('click', () => {
  S.rerolls++;
  gloss(`重掷，标记：不服从 ×${S.rerolls}`, { alarm: true });
  if (S.rerolls === 3) gloss('画像收敛中……');
  revealDoubt();
  playerThrow({ reroll: true });
});

$('btn-accept').addEventListener('click', () => {
  S.lines.push(S.pending);
  S.pending = null;
  renderGua();
  touch();
  if (S.lines.length === 6) finish();
  else readyToThrow();
});

/* ───────── 存疑 ───────── */
$('btn-doubt').addEventListener('click', async () => {
  if (S.finished) return;
  S.doubt = true;
  $('btn-doubt').hidden = true;
  $('huaxin').classList.add('is-broken');
  gloss('观测中断', { alarm: true });
  gloss('对象拒绝被预测');
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
  const mine = S.lines.slice(3).filter((l) => l.moving).length;
  return mine >= 1 ? 'ni' : 'zun';
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

  const complete = S.lines.length === 6;
  const moving = S.lines.map((l) => l.moving);
  const gua = complete ? transform(S.lines) : null;

  const ledgerData = {
    branch: S.branch.zhi, clock: S.clock.toTimeString().slice(0, 5),
    device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    domain: S.domain, qlen: [...S.question].length, pick: Math.round(S.pickMs ?? -1),
    shake: Math.round(S.shakeMs), tries: S.shakeTries, sign: S.sign?.no ?? 0,
    hes: S.hesitations.map(Math.round), rerolls: S.rerolls, idle: S.idle, hidden: S.hidden,
    lines: S.lines.map((l) => l.sum), doubt: S.doubt, total: Math.round(totalMs),
  };
  const seed = hashString(JSON.stringify(ledgerData)) % 4294967296;

  gloss(`画像：${who}，置信 ${conf.toFixed(2)}`);
  show('end');
  $('btn-doubt').hidden = true;

  // 命盘
  const ben = complete ? gua.ben : S.lines.map((l) => l.yang);
  const zhi = complete ? gua.zhi : S.lines.map((l) => l.yang);
  const fields = Object.keys(ledgerData).length;
  $('loom-cap').textContent = `此锦由你的 ${fields} 项行为数据织成，种子 ${seed.toString(16).padStart(8, '0')}`;
  weave($('loom'), { seed, ben: pad6(ben), zhi: pad6(zhi), moving: pad6(moving, false), reduced: reducedMotion });

  $('gua-pair').innerHTML = complete
    ? `${gua.benName}　→　${gua.zhiName}<small>${moving.some(Boolean) ? `变在${moving.map((m, i) => (m ? LINE_LABELS[i] : '')).filter(Boolean).join('、')}爻` : '六爻安静，无变'}</small>`
    : `卦未成<small>${S.lines.length ? `你在第${CN_NUM[S.lines.length + 1]}爻前停下` : S.sign ? '签已落，钱未掷' : '签未落'}</small>`;
  if (!S.lines.length) $('loom-cap').textContent = '无一爻可织。空白，也是一种回答。';

  $('e-seal').textContent = ending.name[0];
  $('e-name').textContent = ending.name;
  $('e-sub').textContent = ending.sub;
  $('e-lead').textContent = ending.lead[tone];
  $('e-verse').replaceChildren(...ending.verse.map((l) => Object.assign(document.createElement('span'), { textContent: l })));
  $('e-critique').textContent = ending.critique;

  renderLedger(totalMs, who, conf, seed);
  const got = new Set(store.get('stj-endings', []));
  got.add(endKey);
  store.set('stj-endings', [...got]);
  renderEndings(got, endKey);

  sfx.bronze(262, 3.2, 0.16);
  if ($('oracle-mode').checked) askOracle(endKey, who, gua);
  else $('oracle').hidden = true;
}

function pad6(arr, fill = null) {
  const out = arr.slice(0, 6);
  while (out.length < 6) out.push(fill);
  return out;
}

function renderLedger(totalMs, who, conf, seed) {
  const h = S.hesitations;
  const autoM = S.lines.slice(0, 3).filter((l) => l.moving).length;
  const mineM = S.lines.slice(3).filter((l) => l.moving).length;
  const rows = [
    ['来访时辰', `${S.branch.zhi}时（设备时钟 ${S.clock.toTimeString().slice(0, 5)}）`],
    ['设备', matchMedia('(pointer: coarse)').matches ? '移动端，触屏' : '桌面端，鼠标'],
    ['所问', S.domain ? db.domains[S.domain].name : '未选'],
    ['心中所问', S.question ? `${[...S.question].length} 字${S.oracleSent ? '，已发给云端模型' : '，原文未离开设备'}` : '未写'],
    ['择题用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
    ['摇签', S.shakeTries ? `${sec(S.shakeMs)} 秒，${S.shakeTries} 次` : '—'],
    ['得签', S.sign ? `第${CN_NUM[S.sign.no]}签 ${S.sign.name}（${S.sign.level}）` : '—'],
    ['亲掷前迟疑', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
    ['重掷', `${S.rerolls} 次`],
    ['变爻', `模型 ${autoM}，你 ${mineM}`],
    ['静止超过八秒', `${S.idle} 次`],
    ['离开页面', `${S.hidden} 次`],
    ['总用时', `${Math.floor(totalMs / 60000)} 分 ${Math.round((totalMs % 60000) / 1000)} 秒`],
    ['画像', `${who}，置信 ${conf.toFixed(2)}`],
    ['命盘种子', seed.toString(16).padStart(8, '0')],
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
      <span><b>${e.name}·${e.sub}</b>${has ? (key === current ? '本局' : '已得') : e.hint}</span>`;
    list.append(li);
  }
}

async function askOracle(endKey, who, gua) {
  const box = $('oracle');
  const p = $('oracle-text');
  box.hidden = false;
  box.classList.add('is-loading');
  p.textContent = '通灵中……';
  gloss('上传画像至云端');
  S.oracleSent = !!S.question;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        domain: S.domain ? db.domains[S.domain].name : '',
        question: S.question,
        sign: S.sign ? { name: S.sign.name, level: S.sign.level, poem: S.sign.poem } : null,
        ben: gua?.benName ?? '', zhi: gua?.zhiName ?? '',
        ending: db.endings[endKey].name, persona: who,
      }),
    });
    if (res.status === 429) S.oracleSent = false; // 限流在读请求体之前拦下，问题没有被读取
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data.text) throw new Error('empty');
    p.textContent = data.text;
    gloss('云端判词已返回');
  } catch {
    p.textContent = '云端未应。以上离线判词即为本局之断。';
    gloss('通灵失败，回落离线判词');
  } finally {
    clearTimeout(timer);
    box.classList.remove('is-loading');
    if (S.question) renderLedgerQuestionRow();
  }
}

function renderLedgerQuestionRow() {
  const dts = [...$('ledger').querySelectorAll('dt')];
  const dt = dts.find((d) => d.textContent === '心中所问');
  if (dt) dt.nextElementSibling.textContent = `${[...S.question].length} 字，已发给云端模型`;
}

$('btn-again').addEventListener('click', () => {
  const visits = store.get('stj-visits', 0) + 1;
  store.set('stj-visits', visits);
  S = freshState();
  gloss(`再问，第 ${visits} 次`);
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
    gloss('离开页面，已记录');
  }
});

setInterval(() => {
  if (!S || S.finished || S.idleFlagged || shaking) return;
  if (!['ding', 'qian', 'yao'].includes(S.screen)) return;
  if (performance.now() - S.lastActive > 8000) {
    S.idleFlagged = true;
    S.idle++;
    gloss('静止八秒，记为迟疑');
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
