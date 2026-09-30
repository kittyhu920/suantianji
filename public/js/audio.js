// 全部声音由 WebAudio 即时合成，不加载任何音频文件

let ctx = null;
let master = null;
let muted = false;
let drone = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// 竹签相叩：短促的带通噪声 + 一点木质共鸣
export function clack(intensity = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.05);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700 + Math.random() * 1600;
  bp.Q.value = 7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * intensity, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(bp).connect(g).connect(master);
  src.start(t);
  src.stop(t + 0.06);

  const o = ctx.createOscillator();
  o.frequency.value = 620 + Math.random() * 300;
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.06 * intensity, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(og).connect(master);
  o.start(t);
  o.stop(t + 0.08);
}

// 青铜：非谐波泛音叠加，缓慢衰减
export function bronze(f0 = 440, dur = 1.4, vol = 0.18) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const partials = [[1, 1], [2.76, 0.5], [5.4, 0.28], [8.93, 0.14]];
  for (const [ratio, amp] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f0 * ratio * (1 + (Math.random() - 0.5) * 0.004);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur / ratio ** 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}

// 签落地
export function thud() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.2);
  clack(0.8);
}

// 水滴：一声上扬的短音，隔一拍再有一点空腔的余响
export function drip(vol = 0.06) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = 640 + Math.random() * 360;
  for (const [delay, ratio, amp, dur] of [[0, 1, 1, 0.2], [0.085, 1.5, 0.32, 0.26]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * ratio, t + delay);
    o.frequency.exponentialRampToValueAtTime(f * ratio * 2.3, t + delay + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(vol * amp, t + delay + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g).connect(master);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.05);
  }
}

// 环境：两条相差 0.6Hz 的低频正弦形成缓慢拍频，加一层滤波噪声
export function startDrone() {
  if (!ctx || drone) return;
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 4);
  g.connect(master);
  const oscs = [55, 55.6, 82.4].map((f, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = i === 2 ? 0.25 : 0.6;
    o.connect(og).connect(g);
    o.start();
    return o;
  });
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(3);
  n.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  const ng = ctx.createGain();
  ng.gain.value = 0.35;
  n.connect(lp).connect(ng).connect(g);
  n.start();
  drone = { g, oscs, n };
}
