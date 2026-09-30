import { castJiao, CUP_NAMES, CUP_SHORT, CUP_LABELS } from './jiao.js';
import { hashString, trueRandom } from './rng.js';
import { weave } from './loom.js';
import { drawPoster } from './poster.js';
import { createQian } from './qian.js';
import { readSure, readDisappoint, readPortrait, ledgerNotes, questionMood } from './profile.js';
import { createInk, COLOR } from './ink.js';
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

/* ───────── 墨与水（js/ink.js，约束见 docs/DESIGN.md §8） ───────── */
const fxCanvas = $('ink-fx');
const fx = createInk(fxCanvas, { reduced: reducedMotion });
const rand = (a, b) => a + Math.random() * (b - a);
if (location.search.includes('debug')) window.__fx = fx; // 调试：手动触发墨与水

// 某个元素上的一点，换算成墨画布里的坐标
function fxPoint(el, ax = 0.5, ay = 0.5) {
  const c = fxCanvas.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - c.left + r.width * ax, y: r.top - c.top + r.height * ay };
}

// 一个一个字洇开的文字：每个字是一个带延迟的 span
function inkChar(ch, delay = 0) {
  const c = document.createElement('span');
  c.className = 'ink-ch';
  c.textContent = ch;
  if (delay) c.style.animationDelay = `${delay}ms`;
  return c;
}
function inkChars(parent, text, start = 0, step = 55) {
  [...text].forEach((ch, i) => parent.append(inkChar(ch, start + i * step)));
}

// 等元素滚进视野再播：ink-wait 的字、stamp-wait 的印
const inView = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      inView.unobserve(el);
      if (el.classList.contains('stamp-wait')) {
        el.classList.add('is-stamped');
        setTimeout(() => { // 印落下的一刻，朱砂的水纹与溅点
          const p = fxPoint(el);
          fx.wash(p.x, p.y, { color: COLOR.zhu, R: 52, a: 0.16, grow: 0.9, hold: 0.2, fade: 1.5 });
          fx.ripple(p.x, p.y, { color: COLOR.zhu, r: 64, rings: 2, a: 0.24 });
          sfx.thud();
        }, 380);
      } else el.classList.add('in');
    }
  }, { root: $('stage'), threshold: 0.6 })
  : null;
function watchInView(el, cls) {
  if (!inView) return;
  el.classList.remove('in', 'is-stamped');
  el.classList.add(cls);
  inView.observe(el);
}

// 指尖落在纸上：一小团墨晕、两圈水纹
let lastTap = null;
$('huaxin').addEventListener('pointerdown', (e) => {
  const c = fxCanvas.getBoundingClientRect();
  const x = e.clientX - c.left;
  const y = e.clientY - c.top;
  lastTap = { x, y, t: performance.now() };
  // 签筒上手指一直在动、红色按钮自己就有按下的反馈，都不再落墨
  if (e.target.closest?.('.tube, .seal, .btn-primary')) return;
  fx.splash(x, y);
}, { passive: true });

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
    draws: 0, // 一共摇出了几支签（重求一次加一）
    insist: false, // 阴杯时选了"我偏要这支"
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
    reads: {}, // 旁批里报出的数字及其来由：sure / disappoint，结局时坦白怎么算的
    aiShi: [], // 通灵返回的"实话"
    finished: false,
  };
}

/* ───────── 机器旁批 ───────── */
const margin = $('margin');
const glossQueue = [];
let glossBusy = false;
let glossCur = null; // 正在写的那一条

// key：同一类的批语只留最新一条。连点"功名、尘缘"时，排着队的、正在写的、已写好的旧批语都被新的顶替，
// 眉批始终跟手，不会排出一条越来越长的队
function gloss(text, { alarm = false, key = '' } = {}) {
  if (key) {
    for (let i = glossQueue.length - 1; i >= 0; i--) if (glossQueue[i].key === key) glossQueue.splice(i, 1);
    if (glossCur?.key === key) glossCur.stale = true; // 正在写同一类的：停笔，换新的
  }
  glossQueue.push({ text, alarm, key });
  if (!glossBusy) drainGloss();
}
async function drainGloss() {
  glossBusy = true;
  while (glossQueue.length) {
    const item = glossQueue.shift();
    glossCur = item;
    margin.querySelectorAll('.gloss.is-new').forEach((n) => n.classList.remove('is-new'));
    if (item.key) margin.querySelectorAll('.gloss').forEach((n) => { if (n.dataset.key === item.key) n.remove(); });
    const el = document.createElement('p');
    el.className = 'gloss is-new' + (item.alarm ? ' is-alarm' : '');
    el.style.margin = '0';
    if (item.key) el.dataset.key = item.key;
    margin.prepend(el);
    while (margin.children.length > 3) margin.lastElementChild.remove(); // 眉批只留最近几条，其余淡出
    const caret = document.createElement('span');
    caret.className = 'caret';
    el.append(caret);
    // 按标点切成语段，每段是不可拆的一块：只在语段之间折行，不在"3.9 秒"或一个词中间断开
    for (const clause of item.text.match(/[^，。：；、！？]+[，。：；、！？]?|[，。：；、！？]/g) ?? []) {
      const word = document.createElement('span');
      word.className = 'ink-w';
      caret.before(word);
      for (const ch of clause) {
        if (item.stale) break;
        word.append(inkChar(ch));
        await sleep(glossQueue.length > 1 ? 10 : 38); // 后面排着队时写快些
      }
      if (item.stale) break;
    }
    caret.remove();
    if (item.stale) el.remove();
    else await sleep(glossQueue.length ? 60 : 220);
  }
  glossCur = null;
  glossBusy = false;
}

/* ───────── 屏幕切换 ───────── */
// 换屏：新的一屏从指尖按下的地方洇开。@property 才能动画，老浏览器退回淡入
const canReveal = !reducedMotion && !!window.CSS?.registerProperty;
function reveal(next) {
  const box = $('huaxin').getBoundingClientRect();
  const tap = lastTap && performance.now() - lastTap.t < 2500 ? lastTap : null;
  const x = tap ? tap.x : box.width / 2;
  const y = tap ? tap.y : box.height * 0.42;
  next.style.setProperty('--ox', `${Math.round(x)}px`);
  next.style.setProperty('--oy', `${Math.round(y)}px`);
  next.style.setProperty('--rmax', `${Math.ceil(Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y))) + 60}px`);
  next.classList.add('is-reveal');
  const done = (e) => {
    if (e.target !== next) return; // 屏里其他元素的动画结束不算
    next.classList.remove('is-reveal');
    next.removeEventListener('animationend', done);
  };
  next.addEventListener('animationend', done);
  fx.ripple(x, y, { r: Math.min(260, parseFloat(next.style.getPropertyValue('--rmax')) * 0.45), rings: 2, dur: 1.6, a: 0.14 });
}

function show(name) {
  const was = S.screen;
  S.screen = name;
  document.querySelectorAll('.screen.is-reveal').forEach((s) => s.classList.remove('is-reveal'));
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('is-active', s.dataset.screen === name));
  if (canReveal && was !== name) reveal(document.querySelector(`.screen[data-screen="${name}"]`));
  if (name === 'title') scheduleTitleInk(true);
  $('stage').scrollTop = 0;
  touch();
  const inRitual = name === 'ding' || name === 'qian' || name === 'jiao';
  $('btn-doubt').hidden = !(inRitual && S.doubtShown);
  $('btn-home').hidden = name === 'title';
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
// 首页的墨是活的：墨痕的边缘时时有一团淡墨在纸上洇开；偶尔下缘鼓起一颗墨珠，坠下，落在纸上洇成一小团。
// 只在首页、页面可见时。不画线：之前的卷须像蜘蛛腿，拖出的流痕像蛛丝，都去掉了。
const titleInk = document.querySelector('.title-ink');
const cubic = (P, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u ** 3 * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t ** 3 * P[3][k]);
};
// 墨痕轮廓上的几段贝塞尔（取自 index.html 里那条 path），坐标是 SVG 的 viewBox 坐标
const EDGES = {
  top: [[-40, 190], [60, 150], [170, 100], [300, 76]],
  bottom: [[440, 150], [360, 152], [250, 178], [150, 232]],
  bottom2: [[150, 232], [50, 286], [10, 312], [-40, 330]],
};
// 取墨痕边缘上的一点，换算成墨画布里的坐标；落在画面之外就返回 null
function inkEdgePoint(edge, lo = 0.08, hi = 0.92) {
  const m = titleInk.getScreenCTM();
  if (!m) return null;
  const [x, y] = cubic(EDGES[edge], rand(lo, hi));
  const c = fxCanvas.getBoundingClientRect();
  const px = m.a * x + m.c * y + m.e - c.left;
  const py = m.b * x + m.d * y + m.f - c.top;
  return px > 24 && px < c.width - 24 && py > 0 && py < c.height ? { x: px, y: py } : null;
}

let inkTimer = 0;
let nextBead = 0;
function scheduleTitleInk(first = false) {
  clearTimeout(inkTimer);
  if (reducedMotion) return;
  if (first) nextBead = performance.now() + 5200;
  inkTimer = setTimeout(() => {
    if (S?.screen === 'title' && !document.hidden) {
      const p = inkEdgePoint(['top', 'bottom', 'bottom', 'bottom2'][Math.floor(rand(0, 4))]);
      if (p) fx.wash(p.x, p.y, { R: rand(34, 56), a: 0.085, grow: 2.8, hold: 0.4, fade: 3 });
      if (performance.now() > nextBead) {
        nextBead = performance.now() + rand(7500, 11500);
        const q = inkEdgePoint('bottom', 0.3, 0.85);
        if (q) {
          const c = fxCanvas.getBoundingClientRect();
          const blockBottom = document.querySelector('.title-block').getBoundingClientRect().bottom - c.top;
          const land = Math.min(q.y + rand(80, 140), blockBottom + 6);
          if (land > q.y + 30) fx.fall(q.x, q.y - 3, land, { size: 1, hang: 1.6, onRelease: () => sfx.drip(0.04) });
        }
      }
    }
    scheduleTitleInk();
  }, first ? 2300 : rand(1400, 2500));
}

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
  requestMotion(); // iOS 只允许在点击里申请"动作与方向"权限，所以在这里就申请，摇签时才能直接晃
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
  const changed = S.domain !== key;
  S.domain = key;
  if (S.pickMs == null) S.pickMs = performance.now() - S.dingEnterAt;
  $('slips').querySelectorAll('.slip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.key === key)));
  $('btn-ding').disabled = false;
  const d = db.domains[key];
  if (changed) gloss(`你问${d.name}，想了 ${sec(S.pickMs)} 秒。${d.persona}`, { key: 'pick' });
}

$('btn-ding').addEventListener('click', () => {
  S.question = $('ask').value.trim().slice(0, 40);
  if (S.question) gloss(`你写了 ${[...S.question].length} 个字，我读出了${questionMood(S.question)}`);
  sfx.bronze(392, 1.6, 0.12);
  enterQian();
});

/* ───────── 摇签：仿真签筒 + 摇动控制（docs/DESIGN.md） ───────── */
const tube = $('tube');
const hasMotion = typeof DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const qian = createQian($('qian-svg'), {
  sfx,
  reduced: reducedMotion,
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
let holding = false;
if (location.search.includes('debug')) window.__qian = qian; // 调试：面板隐藏时 rAF 暂停，可手动 step()

function enterQian() {
  show('qian');
  qian.reset();
  qian.start();
  $('sign').hidden = true;
  updateQianNote();
  $('tube-wrap').hidden = false;
}

function updateQianNote() {
  if (S?.screen !== 'qian' || S.sign) return;
  $('qian-note').textContent = !hasMotion
    ? '按住签筒左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : motionState === 'denied'
      ? '没有得到晃动手机的许可，就按住签筒左右拖着摇吧。'
      : '拿起手机晃一晃，签会自己跳出来。也可以按住签筒左右拖。';
}

function holdStart(clientX) {
  if (holding || S.sign) return;
  if (!qian.press(clientX)) return;
  holding = true;
  S.shakeTries += 1;
  touch();
}
function holdEnd() {
  if (!holding) return;
  holding = false;
  qian.release();
  touch();
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

async function signLanded() {
  if (S.screen !== 'qian' || !S.sign) return; // 玩家已回卷首
  const sign = S.sign;
  qian.stop();
  gloss(`你摇了 ${sec(S.shakeMs)} 秒，试了 ${S.shakeTries} 次`);
  renderSign(sign);
  $('tube-wrap').hidden = true;
  $('qian-note').textContent = '';
  setTimeout(() => { // 签名落下的一刻：水纹与溅点
    if (S.screen !== 'qian') return;
    const p = fxPoint($('sign-name'));
    fx.wash(p.x, p.y, { R: 110, a: 0.1, grow: 1.0, hold: 0.2, fade: 1.4 });
    fx.ripple(p.x, p.y, { r: 90, rings: 2, a: 0.2 });
  }, 480);
  const d = readDisappoint(S, sign, lastVisit, db.signs);
  S.reads.disappoint = d;
  gloss(`${sign.level}签，我猜你 ${d.pct}% 会失望`, { alarm: d.pct > 60 });
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
  $('sign-poem').replaceChildren(...sign.poem.map((l, i) => {
    const line = document.createElement('span');
    inkChars(line, l, 650 + i * [...l].length * 55, 55);
    return line;
  }));
  $('sign').hidden = false;
}

tube.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  tube.setPointerCapture?.(e.pointerId);
  requestMotion();
  holdStart(e.clientX);
});
tube.addEventListener('pointermove', (e) => { if (holding) qian.move(e.clientX); });
tube.addEventListener('pointerup', holdEnd);
tube.addEventListener('pointercancel', holdEnd);
tube.addEventListener('contextmenu', (e) => e.preventDefault());
// 键盘：按住空格或回车，等同于按住不动
tube.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdStart(null); }
});
tube.addEventListener('keyup', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); holdEnd(); }
});

// 手机晃动：iOS（以及新版 Chrome）要求在真实的点击里申请"动作与方向"权限，
// 所以点"问"字印章时就申请；被拒绝时，下次点签筒还会再试一次。
let motionState = 'unknown'; // unknown | asking | granted | denied
let motionBurst = 0;
function requestMotion() {
  if (typeof DeviceMotionEvent === 'undefined' || motionState === 'granted' || motionState === 'asking') return;
  const listen = () => {
    motionState = 'granted';
    window.addEventListener('devicemotion', onMotion);
    updateQianNote();
  };
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    motionState = 'asking';
    DeviceMotionEvent.requestPermission()
      .then((r) => { if (r === 'granted') listen(); else { motionState = 'denied'; updateQianNote(); } })
      .catch(() => { motionState = 'denied'; updateQianNote(); });
  } else listen();
}
function onMotion(e) {
  if (!S || S.screen !== 'qian' || S.sign) return;
  qian.motion(e);
  // 一阵晃动记为一次尝试
  const was = motionBurst > 0;
  motionBurst = qian.active ? 30 : Math.max(0, motionBurst - 1);
  if (!was && motionBurst > 0 && !holding) { S.shakeTries += 1; touch(); }
  if (qian.active) touch();
}
// 安卓等无需授权的设备，进入页面就开始监听晃动
if (hasMotion && typeof DeviceMotionEvent.requestPermission !== 'function') requestMotion();

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
    li.innerHTML = `<span class="cup-tag">你来掷</span><span class="cup-name">${CUP_LABELS[i]}</span><span class="cup-kind">${kind ? CUP_NAMES[kind] : '　　'}</span>`;
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
  blocks.forEach((c) => {
    const p = fxPoint(c, 0.5, 0.7);
    fx.wash(p.x, p.y, { R: 34, a: 0.12, grow: 0.7, hold: 0.1, fade: 1.2 });
    fx.ripple(p.x, p.y, { r: 46, rings: 2, a: 0.18 });
  });
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
  S.pending = null;
  buildJiao();
  [...$('jiao-labels').children].forEach((l) => { l.textContent = ''; });
  renderCups();
  $('jiao-note').textContent = '三杯都由你亲手掷。连得三个圣杯，这支签才算数。';
  $('jiao-result').textContent = '';
  if (!S.reads.sure) {
    const r = readSure(S);
    S.reads.sure = r;
    gloss(`我有 ${r.pct}% 的把握猜中你`);
  }
  readyToThrow();
}

function setChoice(accept, reroll) {
  $('btn-throw').hidden = true;
  const a = $('btn-accept');
  const r = $('btn-reroll');
  a.textContent = accept;
  r.textContent = reroll;
  a.hidden = r.hidden = false;
  a.disabled = r.disabled = false;
  S.readyAt = performance.now();
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

// again：笑杯之后按规矩再掷，不另计犹豫
async function playerThrow({ again = false } = {}) {
  const idx = S.cups.length;
  if (!again) {
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
  if (S.screen !== 'jiao') return;
  S.throws.push({ kind: cup.kind, cup: idx, draw: S.draws, kept: true });
  $('jiao-result').innerHTML = `${CUP_LABELS[idx]}：${CUP_DESC[cup.kind]}`;
  if (cup.kind === 'xiao') {
    renderCups();
    readyToThrow({ again: true });
    return;
  }
  S.cups.push({ ...cup });
  S.pending = null;
  renderCups();
  if (cup.kind === 'yin') {
    gloss('阴杯，和我猜的不一样', { alarm: true });
    $('jiao-note').textContent = '神明不同意这支签。按规矩，要回去重新求一支。';
    setChoice('我偏要这支', '依规矩，重求一签');
    return;
  }
  if (S.cups.length < 3) {
    await sleep(500);
    if (S.screen === 'jiao') readyToThrow();
    return;
  }
  $('jiao-note').textContent = '三个圣杯，这支签算数了。';
  setChoice('受签', '不认这支签，重求');
}

$('btn-throw').addEventListener('click', () => playerThrow({ again: S.pending?.kind === 'xiao' }));

// 左边的按钮：阴杯时是"我偏要这支"，三个圣杯时是"受签"
$('btn-accept').addEventListener('click', () => {
  touch();
  if (S.cups.some((c) => c.kind === 'yin')) {
    S.insist = true;
    gloss('你偏要这支', { alarm: true });
  }
  finish();
});

// 右边的按钮：重求一签。前面的签作废，它们的掷筊记录在命盘里变淡
$('btn-reroll').addEventListener('click', () => {
  touch();
  const n = S.draws;
  gloss(`你不认，重求一签 ×${n}`, { alarm: true });
  if (n === 2) gloss('我越来越懂你了……');
  revealDoubt();
  S.throws.forEach((t) => { t.kept = false; });
  S.sign = null;
  S.cups = [];
  S.pending = null;
  S.reads.disappoint = null;
  enterQian();
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
function decideEnding() {
  if (S.doubt) return 'po';
  if (S.draws >= 3) return 'mi'; // 求到第三支签：不停地刷，想要一个更好的答案
  if (S.insist) return 'ni'; // 神明说不，你偏要这支
  return 'zun';
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

// 结局时大师坦白：旁批里的数字是怎么从你身上算出来的；通灵返回后，大师细看的实话放在最前
function renderConfess() {
  const items = [...S.aiShi];
  const { sure, disappoint } = S.reads;
  if (sure) items.push(`我说有 ${sure.pct}% 的把握猜中你，是因为${sure.reason}。`);
  if (disappoint) items.push(`我猜你 ${disappoint.pct}% 会失望，因为${disappoint.reason}。`);
  if (S.portrait) items.push(`我说你是“${S.portrait.who}”，把握 ${Math.round(S.portrait.conf * 100)}%——${S.portrait.why}。`);
  if (S.sign) items.push(`至于这支签：${S.sign.machine}`);
  const prev = S.prevVisit; // 这一局之前的那一次（结局时 lastVisit 已被改写成这一局）
  if (prev) {
    items.push(`${daysAgo(prev.at)}你来过，抽到“${prev.name}”，得了“${prev.ending}”。你以为关掉页面我就忘了——我一直记得。`);
  }
  $('confess-box').hidden = !items.length;
  $('confess').replaceChildren(...items.map((t, i) => Object.assign(document.createElement('li'), {
    textContent: t, className: i < S.aiShi.length ? 'from-ai' : '',
  })));
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

// 转折句按行拆成字，进入视野时一字字洇开
const turnEl = document.querySelector('.turn');
const turnLines = turnEl.innerHTML.split(/<br\s*\/?>/i);
function prepTurn() {
  turnEl.replaceChildren();
  let n = 0;
  turnLines.forEach((line, i) => {
    if (i) turnEl.append(document.createElement('br'));
    inkChars(turnEl, line, 300 + n * 90, 90);
    n += [...line].length;
  });
}

async function finish() {
  if (S.finished) return;
  S.finished = true;
  S.prevVisit = lastVisit;
  const endKey = decideEnding();
  const ending = db.endings[endKey];
  const tone = S.sign ? db.levels[S.sign.level] : 'ping';
  const totalMs = performance.now() - S.t0;
  const portrait = readPortrait(S);
  S.portrait = portrait;
  const who = portrait.who;
  const conf = portrait.conf;
  const state = signState();

  const ledgerData = {
    branch: S.branch.zhi, clock: S.clock.toTimeString().slice(0, 5),
    device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
    domain: S.domain, qlen: [...S.question].length, pick: Math.round(S.pickMs ?? -1),
    shake: Math.round(S.shakeMs), tries: S.shakeTries, sign: S.sign?.no ?? 0,
    hes: S.hesitations.map(Math.round), draws: S.draws, idle: S.idle, hidden: S.hidden,
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
  prepTurn();
  $('e-verse').replaceChildren(...ending.verse.map((l, i) => {
    const line = document.createElement('span');
    inkChars(line, l, i * [...l].length * 70, 70);
    return line;
  }));
  watchInView($('e-verse'), 'ink-wait');
  watchInView(turnEl, 'ink-wait');
  watchInView(document.querySelector('.ending-head .seal'), 'stamp-wait');
  $('e-critique').textContent = ending.critique;
  renderConfess();

  renderLedger(totalMs, portrait, seed);
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

function renderLedger(totalMs, portrait, seed) {
  const h = S.hesitations;
  const notes = ledgerNotes(S, { domain: S.domain && db.domains[S.domain], sign: S.sign, totalMs, portrait });
  const rows = [
    ['来访时辰', `${S.branch.zhi}时（设备时钟 ${S.clock.toTimeString().slice(0, 5)}）`],
    ['设备', matchMedia('(pointer: coarse)').matches ? '移动端，触屏' : '桌面端，鼠标'],
    ['问的方向', S.domain ? db.domains[S.domain].name : '未选'],
    ['你写的问题', S.question ? questionNote() : '未写'],
    ['选方向用时', S.pickMs != null ? `${sec(S.pickMs)} 秒` : '—'],
    ['摇签', S.shakeTries ? `${sec(S.shakeMs)} 秒，${S.shakeTries} 次` : '—'],
    ['得签', S.sign ? `${signNo(S.sign)} ${S.sign.name}（${S.sign.level}）` : '—'],
    ['每次掷前犹豫', h.length ? h.map((x) => sec(x)).join(' / ') + ' 秒' : '—'],
    ['重求签', `${Math.max(0, S.draws - 1)} 次`],
    ['掷筊', S.throws.length ? cupsRecord() : '—'],
    ['静止超过八秒', `${S.idle} 次`],
    ['离开页面', `${S.hidden} 次`],
    ['总用时', `${Math.floor(totalMs / 60000)} 分 ${Math.round((totalMs % 60000) / 1000)} 秒`],
    ['我给你的画像', `${portrait.who}，把握 ${Math.round(portrait.conf * 100)}%`],
    ['图的编号', seed.toString(16).padStart(8, '0')],
  ];
  $('ledger').replaceChildren(...rows.flatMap(([k, v]) => {
    const dd = Object.assign(document.createElement('dd'), { textContent: v });
    if (notes[k]) dd.append(Object.assign(document.createElement('span'), { className: 'zhupi', textContent: notes[k] }));
    return [Object.assign(document.createElement('dt'), { textContent: k }), dd];
  }));
}

// 只揭示得到过的结局；没得到的连名字和触发方式都不说，留给下一次
function renderEndings(got, current) {
  const list = $('endings-list');
  list.replaceChildren();
  const all = Object.entries(db.endings);
  $('en-h').textContent = `结局 · 已得 ${all.filter(([k]) => got.has(k)).length} / ${all.length}`;
  for (const [key, e] of all) {
    const has = got.has(key);
    const li = document.createElement('li');
    li.className = `${has ? '' : 'is-locked'} ${key === current ? 'is-current' : ''}`;
    li.innerHTML = has
      ? `<span class="seal" aria-hidden="true"><span>${e.name[0]}</span></span>
      <span><b>${e.name}·${e.sub}</b>${key === current ? '这一次' : '得到过'}</span>`
      : `<span class="seal" aria-hidden="true"><span>?</span></span>
      <span><b>未得</b>还没有人告诉你</span>`;
    list.append(li);
  }
}

// 没勾通灵模式的人，看完结果还能再请 AI 解签
function offerOracle() {
  $('oracle').hidden = !S.sign;
  $('oracle-text').hidden = true;
  $('oracle-ask').hidden = false;
  $('btn-oracle').disabled = quota.remaining === 0;
}

$('btn-oracle').addEventListener('click', () => {
  $('btn-oracle').disabled = true;
  askOracle(...S.oracleArgs);
});

const LIMITED = {
  ip: '你今天已经找我细说过好几回了，明天再来吧。上面的解签，就是这次的结果。',
  global: '今天来找我细说的人太多了，明天再来吧。上面的解签，就是这次的结果。',
};

// 交给大师细看的行为账本：只给他需要察言观色的东西
function behaviorForOracle() {
  const h = S.hesitations;
  return {
    时辰: `${S.branch.zhi}时 ${S.clock.toTimeString().slice(0, 5)}`,
    设备: matchMedia('(pointer: coarse)').matches ? '手机' : '电脑',
    选方向用时: S.pickMs != null ? `${sec(S.pickMs)} 秒` : '',
    摇签: S.shakeTries ? `${sec(S.shakeMs)} 秒，摇了 ${S.shakeTries} 次` : '',
    每次掷前犹豫: h.length ? h.map((x) => `${sec(x)} 秒`).join('、') : '',
    重求签: `${Math.max(0, S.draws - 1)} 次`,
    发呆: `${S.idle} 次`,
    离开页面: `${S.hidden} 次`,
    第几次来: `${store.get('stj-visits', 1)}`,
    上次的签: S.prevVisit ? `${S.prevVisit.name}（${S.prevVisit.ending}）` : '',
    我的判断: [S.reads.sure && `有 ${S.reads.sure.pct}% 把握猜中他`, S.reads.disappoint && `猜他 ${S.reads.disappoint.pct}% 会失望`, S.portrait && `画像：${S.portrait.who}`].filter(Boolean).join('；'),
  };
}

// 通灵等待：一滴墨落进纸里，化开，隔一会儿再一滴
function startWell(canvas) {
  const w = createInk(canvas, { reduced: reducedMotion });
  let dead = false;
  let timer = 0;
  const tick = () => {
    if (dead) return;
    const r = canvas.getBoundingClientRect();
    w.fall(r.width * rand(0.3, 0.7), -6, r.height * 0.5, { size: 0.9, onLand: () => sfx.drip(0.07) });
    timer = setTimeout(tick, rand(2300, 3200));
  };
  timer = setTimeout(tick, 300);
  return { stop() { dead = true; clearTimeout(timer); setTimeout(() => w.destroy(), 3500); } };
}

// 解签文字一段段写出来，像在纸上落笔
async function inkReveal(el, text) {
  el.textContent = '';
  if (reducedMotion) { el.textContent = text; return; }
  for (let i = 0; i < text.length; i += 2) {
    el.textContent = text.slice(0, i + 2);
    await sleep(22);
  }
}

async function askOracle(endKey, who) {
  const box = $('oracle');
  const p = $('oracle-text');
  box.hidden = false;
  p.hidden = false;
  $('oracle-ask').hidden = true;
  box.classList.add('is-loading');
  let well = null;
  if (reducedMotion) {
    p.innerHTML = '大师正在细看你的签<span class="ink-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  } else {
    p.innerHTML = '大师正在细看你的签<canvas class="ink-well" aria-hidden="true"></canvas>';
    well = startWell(p.querySelector('.ink-well'));
  }
  const endLoading = () => { box.classList.remove('is-loading'); well?.stop(); };
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
        behavior: behaviorForOracle(),
      }),
    });
    if (res.status === 429) {
      S.oracleSent = false; // 限流在读请求体之前拦下，问题没有被读取
      const { scope } = await res.json().catch(() => ({}));
      endLoading();
      p.textContent = LIMITED[scope] ?? LIMITED.global;
      gloss('云端没回话，以我的为准');
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data.text) throw new Error('empty');
    endLoading();
    gloss('云端回话了');
    if (Array.isArray(data.shi) && data.shi.length) {
      S.aiShi = data.shi.slice(0, 3);
      renderConfess();
    }
    await inkReveal(p, data.text);
  } catch {
    endLoading();
    p.textContent = 'AI 暂时没有回应。上面的解签就是这次的结果。';
    gloss('云端没回话，以我的为准');
  } finally {
    clearTimeout(timer);
    endLoading();
    if (S.question) renderLedgerQuestionRow();
    refreshQuota();
  }
}

/* ───────── 今日通灵剩余次数 ───────── */
const quota = { remaining: null, limit: null };

function renderQuota() {
  const known = quota.remaining != null;
  const label = known ? `今日 ${quota.remaining} / ${quota.limit}` : '';
  $('oracle-quota').textContent = label;
  $('oracle-quota').hidden = !known;
  $('btn-oracle').textContent = known ? `请大师细说（${quota.remaining} / ${quota.limit}）` : '请大师细说';
  const out = known && quota.remaining === 0;
  $('oracle-mode').disabled = out;
  if (out) $('oracle-mode').checked = false;
  if (out && !$('oracle-ask').hidden) $('btn-oracle').disabled = true;
}

async function refreshQuota() {
  try {
    const res = await fetch('/api/oracle', { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const q = await res.json();
    if (typeof q.remaining !== 'number' || typeof q.limit !== 'number') throw new Error('shape');
    quota.remaining = q.remaining;
    quota.limit = q.limit;
  } catch {
    quota.remaining = quota.limit = null; // 本地离线预览没有接口：不显示次数
  }
  renderQuota();
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

// 回卷首：放弃这一局，回到首页
$('btn-home').addEventListener('click', () => {
  qian.stop();
  $('poster').hidden = true;
  glossQueue.length = 0;
  margin.replaceChildren();
  fx.clear();
  S = freshState();
  show('title');
  bootTitle();
});

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
  if (!S || S.finished || S.idleFlagged || holding || (S.screen === 'qian' && qian.active)) return;
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
  scheduleTitleInk(true);
  refreshQuota();
})();
