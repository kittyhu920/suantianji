// 摇签：仿真签筒 + 摇动控制（约束见 docs/DESIGN.md）
// 签筒绕筒底转动，倾角由弹簧追随输入；竹签在筒里受力跳动，落回筒底即是一声"叩"；
// 摇动累积能量，被选中的那支签随能量一点点冒出筒口，满了就飞出去，受重力落地、弹跳、躺平。

const NS = 'http://www.w3.org/2000/svg';
const VW = 320;
const VH = 440;
const FLOOR = 424;
const PX = 160; // 转轴：筒底中心
const PY = 402;
const RIM = 196; // 筒口
const TL = 110; // 筒身左右
const TR = 210;
const STICK_LEN = 250;
const STICK_W = 8;
const N = 13;

const G = 2400; // 重力 px/s²
const K = 90; // 倾角弹簧
const C = 12; // 倾角阻尼
const BOUNCE = 0.35;
const FRICTION = 0.8;
const STEP = 1 / 120;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rad = (d) => (d * Math.PI) / 180;
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.append(e);
  return e;
};

function defs(svg) {
  const d = el('defs', {}, svg);
  d.innerHTML = `
    <linearGradient id="q-lacquer" x1="0" x2="1">
      <stop offset="0" stop-color="#4a0c09"/><stop offset=".16" stop-color="#8f1f19"/>
      <stop offset=".3" stop-color="#e0574a"/><stop offset=".42" stop-color="#b52a22"/>
      <stop offset=".78" stop-color="#7a1813"/><stop offset="1" stop-color="#3a0806"/>
    </linearGradient>
    <linearGradient id="q-gold" x1="0" x2="1">
      <stop offset="0" stop-color="#8a6b33"/><stop offset=".3" stop-color="#f0d89a"/>
      <stop offset=".55" stop-color="#C5A059"/><stop offset="1" stop-color="#6e5428"/>
    </linearGradient>
    <linearGradient id="q-bamboo" x1="0" x2="1">
      <stop offset="0" stop-color="#e6cf94"/><stop offset=".45" stop-color="#b8995a"/><stop offset="1" stop-color="#7a6236"/>
    </linearGradient>
    <linearGradient id="q-shine" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".6" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="q-mouth" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#050202"/><stop offset=".8" stop-color="#1c0b0b"/><stop offset="1" stop-color="#3a1212"/>
    </radialGradient>
    <filter id="q-grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".9 .04" numOctaves="3" seed="11"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="q-crack" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency=".05 .6" numOctaves="2" seed="4"/>
      <feColorMatrix values="0 0 0 0 1  0 0 0 0 .85  0 0 0 0 .7  0 0 0 -2.2 1.1"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="q-soft" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>`;
}

function stickShape(parent) {
  // 以签身中心为原点，签头朝上（y 负方向）
  const g = el('g', {}, parent);
  const h = STICK_LEN / 2;
  el('rect', { x: -STICK_W / 2, y: -h, width: STICK_W, height: STICK_LEN, rx: 2, fill: 'url(#q-bamboo)' }, g);
  el('rect', { x: -STICK_W / 2, y: -h, width: STICK_W, height: STICK_LEN, rx: 2, fill: '#000', filter: 'url(#q-grain)', opacity: '.55' }, g);
  el('rect', { x: -STICK_W / 2, y: -h, width: STICK_W, height: 14, rx: 2, fill: '#9E2A2B' }, g); // 签头朱红
  for (const y of [-h + 58, -h + 150]) el('rect', { x: -STICK_W / 2, y, width: STICK_W, height: 1.4, fill: '#6e5428', opacity: '.7' }, g); // 竹节
  el('rect', { x: -STICK_W / 2 + 1, y: -h + 2, width: 1.4, height: STICK_LEN - 4, fill: '#fff', opacity: '.25' }, g); // 左上来光
  return g;
}

export function createQian(svg, { sfx, reduced = false, onRelease, onLanded }) {
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.replaceChildren();
  defs(svg);

  const tubeShadow = el('ellipse', { cx: PX, cy: FLOOR - 2, rx: 66, ry: 9, fill: '#0d1117', opacity: '.55', filter: 'url(#q-soft)' }, svg);
  const flyShadow = el('ellipse', { cx: PX, cy: FLOOR - 1, rx: 20, ry: 5, fill: '#0d1117', opacity: '0', filter: 'url(#q-soft)' }, svg);
  const rig = el('g', {}, svg);

  // 筒口内壁（在签后面）
  el('ellipse', { cx: PX, cy: RIM, rx: (TR - TL) / 2, ry: 12, fill: 'url(#q-mouth)' }, rig);
  el('path', { d: `M${TL} ${RIM} A${(TR - TL) / 2} 12 0 0 1 ${TR} ${RIM}`, fill: 'none', stroke: '#8a6b33', 'stroke-width': 2.5 }, rig); // 口沿后半圈
  const sticksG = el('g', {}, rig);
  // 筒身（挡住签的下半截）
  const bodyPath = `M${TL} ${RIM} V${PY - 20} Q${TL} ${PY} ${TL + 22} ${PY} H${TR - 22} Q${TR} ${PY} ${TR} ${PY - 20} V${RIM} A${(TR - TL) / 2} 12 0 0 1 ${TL} ${RIM} Z`;
  el('path', { d: bodyPath, fill: 'url(#q-lacquer)' }, rig);
  el('path', { d: bodyPath, fill: '#000', filter: 'url(#q-grain)', opacity: '.2' }, rig);
  el('path', { d: bodyPath, fill: '#000', filter: 'url(#q-crack)', opacity: '.12' }, rig);
  el('rect', { x: TL + 12, y: RIM + 8, width: 12, height: PY - RIM - 30, rx: 6, fill: 'url(#q-shine)' }, rig); // 左上高光
  for (const y of [RIM + 20, PY - 34]) {
    el('rect', { x: TL, y, width: TR - TL, height: 7, fill: 'url(#q-gold)' }, rig);
    el('rect', { x: TL, y: y + 7, width: TR - TL, height: 1.5, fill: '#2a0605', opacity: '.6' }, rig);
  }
  const brush = "'Ma Shan Zheng','STKaiti','KaiTi',serif";
  for (const [ch, y] of [['天', RIM + 88], ['机', RIM + 136]]) {
    el('text', { x: PX + 1.5, y: y + 1.5, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 34, fill: '#2a0605', opacity: '.55' }, rig).textContent = ch;
    el('text', { x: PX, y, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 34, fill: 'url(#q-gold)' }, rig).textContent = ch;
  }
  // 口沿：金边前半弧
  el('path', { d: `M${TL} ${RIM} A${(TR - TL) / 2} 12 0 0 0 ${TR} ${RIM}`, fill: 'none', stroke: 'url(#q-gold)', 'stroke-width': 4 }, rig);

  const flyG = el('g', { opacity: '0' }, svg);
  stickShape(flyG);
  const labelEl = el('text', { x: PX, y: FLOOR - 30, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 22, fill: '#C5A059', opacity: '0' }, svg);
  const dustG = el('g', {}, svg);

  let sticks;
  let st;

  function reset() {
    sticksG.replaceChildren();
    const xs = Array.from({ length: N }, (_, i) => TL + 16 + (i * (TR - TL - 32)) / (N - 1) + rand(-2, 2));
    const order = xs.map((_, i) => i).sort(() => Math.random() - 0.5);
    sticks = order.map((i) => {
      const top = rand(64, 108);
      const g = stickShape(sticksG);
      return { x: xs[i], top, tilt: rand(-3, 3), o: 0, v: 0, g };
    });
    const pick = sticks[Math.floor(N / 2 + rand(-2, 2))];
    pick.rise = pick.top + STICK_LEN - RIM + 6; // 签尾完全离开筒口
    st = {
      a: 0, av: 0, prevAv: 0, target: 0,
      energy: 0, pick,
      mode: 'idle', // idle | drag | auto
      startX: 0, lastX: 0, lastT: 0, dragV: 0, heldAt: 0, moved: false,
      motionRate: 0, motionAt: 0, motionKick: 0, activeMs: 0,
      phase: 'shake', // shake | fly | settle | done
      fly: null, dust: [], lastClack: 0, lastBuzz: 0, t: 0,
    };
    rig.style.transition = '';
    rig.setAttribute('opacity', '1');
    tubeShadow.setAttribute('opacity', '.55');
    flyG.setAttribute('opacity', '0');
    flyShadow.setAttribute('opacity', '0');
    labelEl.setAttribute('opacity', '0');
    dustG.replaceChildren();
    draw();
  }

  const buzz = (ms, gap) => {
    if (st.t - st.lastBuzz < gap) return;
    st.lastBuzz = st.t;
    // 浏览器要求用户真实点过页面才允许震动；iOS 不支持，直接略过
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate?.(ms); } catch { /* 部分浏览器禁用 */ }
  };

  /* ───── 输入 ───── */
  const toView = (clientX) => {
    const r = svg.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * VW;
  };
  function press(clientX) {
    if (st.phase !== 'shake') return false;
    st.mode = 'drag';
    st.startX = st.lastX = clientX == null ? 0 : toView(clientX);
    st.lastT = performance.now();
    st.heldAt = st.lastT;
    st.moved = clientX == null;
    if (clientX == null) st.mode = 'auto';
    return true;
  }
  function move(clientX) {
    if (st.mode !== 'drag') return;
    const x = toView(clientX);
    const now = performance.now();
    const dt = Math.max(1, now - st.lastT) / 1000;
    st.dragV = st.dragV * 0.7 + (Math.abs(x - st.lastX) / dt) * 0.3;
    if (Math.abs(x - st.startX) > 6) st.moved = true;
    st.target = clamp((x - st.startX) * 0.45, -38, 38);
    st.lastX = x;
    st.lastT = now;
  }
  function release() {
    st.mode = 'idle';
    st.target = 0;
    st.dragV = 0;
  }
  // 手机：倾斜决定倾角，晃动的力度累积能量
  function motion(e) {
    if (st.phase !== 'shake') return;
    const g = e.accelerationIncludingGravity;
    const a = e.acceleration;
    if (g && st.mode === 'idle') st.target = clamp(-(g.x || 0) * 3.4, -38, 38);
    let mag;
    if (a && a.x != null) mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    else if (g) mag = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.8);
    if (mag == null) return;
    st.motionRate = Math.min(0.6, Math.max(0, mag - 3) / 20);
    st.motionKick = Math.max(st.motionKick, mag);
    if (a?.x) st.av += -a.x * 6;
    if (st.motionRate > 0) st.motionAt = st.t;
  }

  /* ───── 物理 ───── */
  function step(dt) {
    st.t += dt;
    if (st.phase === 'shake') shakeStep(dt);
    else if (st.phase === 'fly' || st.phase === 'settle') flyStep(dt);
    dustStep(dt);
  }

  function shakeStep(dt) {
    let rate = 0;
    const now = performance.now();
    if (st.mode === 'drag' && !st.moved && now - st.heldAt > 350) st.mode = 'auto'; // 按住不动：自己轻摇
    if (st.mode === 'auto') {
      st.target = 20 * Math.sin(st.t * 2 * Math.PI * 1.7) + 4 * Math.sin(st.t * 17);
      rate = 0.32;
    } else if (st.mode === 'drag') {
      rate = Math.min(0.6, st.dragV / 2000);
      st.dragV *= 0.92;
    }
    const phoneActive = st.t - st.motionAt < 0.25;
    if (phoneActive) rate = Math.max(rate, st.motionRate);
    if (rate > 0.02) st.activeMs += dt * 1000;
    st.energy = clamp(st.energy + rate * dt - 0.03 * dt, 0, 1);

    // 倾角弹簧
    const aa = K * (st.target - st.a) - C * st.av;
    st.av += aa * dt;
    st.a += st.av * dt;
    const jerk = Math.abs(st.av - st.prevAv) / dt;
    st.prevAv = st.av;
    const kick = Math.min(260, jerk * 0.12 + (phoneActive ? st.motionKick * 12 : 0));
    st.motionKick *= 0.9;

    // 竹签：随晃动被抛起，落回筒底就是一声叩
    for (const s of sticks) {
      if (kick > 20 && Math.random() < dt * 9) s.v -= rand(0.3, 1) * kick;
      s.v += G * dt;
      s.o += s.v * dt;
      if (s.o < -40) { s.o = -40; s.v = Math.max(0, s.v); }
      if (s.o > 0) {
        if (s.v > 90 && st.t - st.lastClack > 0.035) {
          st.lastClack = st.t;
          sfx?.clack(Math.min(1, s.v / 320) * 0.8);
          buzz(6, 0.06);
        }
        s.o = 0;
        s.v = -s.v * 0.25;
      }
    }
    if (st.energy >= 1) launch();
  }

  function stickWorld(s) {
    const base = s === st.pick ? -st.energy * s.rise : 0;
    const cx = s.x;
    const cy = s.top + s.o + base + STICK_LEN / 2;
    const r = rad(st.a);
    const dx = cx - PX;
    const dy = cy - PY;
    return { x: PX + dx * Math.cos(r) - dy * Math.sin(r), y: PY + dx * Math.sin(r) + dy * Math.cos(r), rot: st.a + s.tilt };
  }

  function launch() {
    const s = st.pick;
    const w = stickWorld(s);
    s.g.setAttribute('opacity', '0');
    const r = rad(st.a);
    const speed = 480;
    let vx = Math.sin(r) * speed + Math.cos(r) * rad(st.av) * 120;
    const vy = -Math.cos(r) * speed + Math.sin(r) * rad(st.av) * 120;
    if (Math.abs(st.a) < 8) vx += (Math.random() < 0.5 ? -1 : 1) * 140;
    st.fly = { x: w.x, y: w.y, rot: w.rot, vx, vy, w: st.a * 3 + Math.sign(vx || 1) * 160, hits: 0, settleT: 0 };
    st.phase = 'fly';
    flyG.setAttribute('opacity', '1');
    const label = onRelease?.();
    labelEl.textContent = label || '';
    rig.setAttribute('opacity', '.9');
    st.target = 0;
    if (reduced) { settleNow(); }
  }

  function halfExtentY(rot) {
    const r = rad(rot);
    return Math.abs(Math.cos(r)) * STICK_LEN / 2 + Math.abs(Math.sin(r)) * STICK_W / 2;
  }
  const norm = (d) => ((d + 180) % 360 + 360) % 360 - 180;

  function flyStep(dt) {
    // 签筒回正
    const aa = K * (0 - st.a) - C * st.av;
    st.av += aa * dt;
    st.a += st.av * dt;
    const f = st.fly;
    const lay = Math.sin(rad(f.rot)) >= 0 ? 90 : -90;
    if (st.phase === 'fly') {
      f.vy += G * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot = norm(f.rot + f.w * dt);
      const hx = Math.abs(Math.sin(rad(f.rot))) * STICK_LEN / 2;
      if (f.x - hx < 4) { f.x = 4 + hx; f.vx = Math.abs(f.vx) * 0.3; }
      if (f.x + hx > VW - 4) { f.x = VW - 4 - hx; f.vx = -Math.abs(f.vx) * 0.3; }
      const hy = halfExtentY(f.rot);
      if (f.y + hy > FLOOR && f.vy > 0) {
        f.y = FLOOR - hy;
        const impact = f.vy;
        f.hits++;
        // 先着地的是较低的那一端
        const r = rad(f.rot);
        const endX = f.x + (Math.cos(r) > 0 ? -1 : 1) * Math.sin(r) * STICK_LEN / 2;
        if (f.hits === 1) {
          sfx?.thud();
          buzz(24, 0);
          burst(endX, FLOOR, Math.min(1, impact / 900));
        } else {
          sfx?.clack(Math.min(1, impact / 700) * 0.9);
          buzz(8, 0.05);
        }
        f.vy = -Math.abs(f.vy) * BOUNCE;
        f.vx *= FRICTION;
        f.w = f.w * 0.4 + (lay - f.rot) * 4;
        if (Math.abs(f.vy) < 110) st.phase = 'settle';
      }
    } else {
      f.settleT += dt;
      const k = Math.min(1, f.settleT / 0.28);
      f.rot += (lay - f.rot) * k;
      const x0 = STICK_LEN / 2 + 6;
      f.x = clamp(f.x + f.vx * dt, x0, VW - x0);
      f.vx *= 0.9;
      f.y += (FLOOR - halfExtentY(f.rot) - f.y) * k;
      if (k >= 1) done();
    }
  }

  function settleNow() {
    const f = st.fly;
    f.rot = 90;
    f.x = PX;
    f.y = FLOOR - STICK_W / 2;
    sfx?.thud();
    done();
  }

  function done() {
    st.phase = 'done';
    const f = st.fly;
    labelEl.setAttribute('x', clamp(f.x, 60, VW - 60));
    labelEl.setAttribute('opacity', '1');
    rig.style.transition = 'opacity .5s';
    rig.setAttribute('opacity', '.28');
    tubeShadow.setAttribute('opacity', '.2');
    draw();
    setTimeout(() => onLanded?.({ activeMs: st.activeMs }), reduced ? 300 : 700);
  }

  function burst(x, y, power) {
    for (let i = 0; i < 18; i++) {
      const c = el('circle', { r: rand(0.8, 2.2).toFixed(2), fill: Math.random() < 0.5 ? '#f0d89a' : '#C5A059' }, dustG);
      const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(80, 320) * (0.5 + power);
      st.dust.push({ c, x: x + rand(-40, 40), y: y - 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.6, 1.1), age: 0 });
    }
  }
  function dustStep(dt) {
    st.dust = st.dust.filter((p) => {
      p.age += dt;
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y = Math.min(FLOOR - 1, p.y + p.vy * dt);
      if (p.age >= p.life) { p.c.remove(); return false; }
      return true;
    });
  }

  /* ───── 绘制 ───── */
  function draw() {
    rig.setAttribute('transform', `rotate(${st.a.toFixed(2)} ${PX} ${PY})`);
    tubeShadow.setAttribute('cx', (PX + Math.sin(rad(st.a)) * 30).toFixed(1));
    tubeShadow.setAttribute('rx', (66 + Math.abs(st.a) * 0.6).toFixed(1));
    for (const s of sticks) {
      const base = s === st.pick && st.phase === 'shake' ? -st.energy * s.rise : 0;
      s.g.setAttribute('transform', `translate(${s.x.toFixed(1)} ${(s.top + s.o + base + STICK_LEN / 2).toFixed(1)}) rotate(${s.tilt.toFixed(1)})`);
    }
    if (st.fly) {
      const f = st.fly;
      flyG.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${f.rot.toFixed(1)})`);
      const h = FLOOR - (f.y + halfExtentY(f.rot));
      flyShadow.setAttribute('cx', f.x.toFixed(1));
      flyShadow.setAttribute('rx', Math.max(10, Math.abs(Math.sin(rad(f.rot))) * STICK_LEN / 2).toFixed(1));
      flyShadow.setAttribute('opacity', (0.5 * clamp(1 - h / 260, 0, 1)).toFixed(2));
    }
    for (const p of st.dust) {
      p.c.setAttribute('cx', p.x.toFixed(1));
      p.c.setAttribute('cy', p.y.toFixed(1));
      p.c.setAttribute('opacity', (1 - p.age / p.life).toFixed(2));
    }
  }

  /* ───── 循环 ───── */
  let raf = 0;
  let last = 0;
  let acc = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - (last || now)) / 1000);
    last = now;
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    draw();
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  reset();
  return {
    reset, start, stop, press, move, release, motion,
    get active() { return st.mode !== 'idle' || st.t - st.motionAt < 0.5; },
    get phase() { return st.phase; },
    step, draw, // 供调试：面板隐藏时 rAF 会暂停，可手动推进
  };
}
