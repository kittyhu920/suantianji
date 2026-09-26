// 摇签：水墨签筒 + 摇动控制（约束见 docs/DESIGN.md：写意的画，真实的动）
// 运动中的器物不用 SVG 滤镜（每帧重算太卡），笔意靠不规则路径与墨色渐变。
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
    <linearGradient id="q-wash" x1="0" x2="1">
      <stop offset="0" stop-color="#1b1712" stop-opacity=".92"/><stop offset=".18" stop-color="#2e2820" stop-opacity=".62"/>
      <stop offset=".42" stop-color="#6b6254" stop-opacity=".2"/><stop offset=".62" stop-color="#8a8070" stop-opacity=".1"/>
      <stop offset=".86" stop-color="#3a342b" stop-opacity=".5"/><stop offset="1" stop-color="#1b1712" stop-opacity=".88"/>
    </linearGradient>
    <linearGradient id="q-wash-v" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#1b1712" stop-opacity="0"/><stop offset=".7" stop-color="#1b1712" stop-opacity=".08"/><stop offset="1" stop-color="#1b1712" stop-opacity=".32"/>
    </linearGradient>
    <linearGradient id="q-stick" x1="0" x2="1">
      <stop offset="0" stop-color="#2a241c"/><stop offset=".5" stop-color="#5a5244"/><stop offset="1" stop-color="#1b1712"/>
    </linearGradient>
    <radialGradient id="q-mouth" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#1b1712"/><stop offset="1" stop-color="#1b1712" stop-opacity=".75"/>
    </radialGradient>
    <radialGradient id="q-pool" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#1b1712" stop-opacity=".22"/><stop offset="1" stop-color="#1b1712" stop-opacity="0"/>
    </radialGradient>`;
}

// 一条手绘感的墨线：在直线上加细小的起伏
function wobble(x1, y1, x2, y2, amp = 1.6, seg = 9) {
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const len = Math.hypot(nx, ny) || 1;
  for (let i = 1; i <= seg; i++) {
    const t = i / seg;
    const k = i === seg ? 0 : rand(-amp, amp);
    d += ` L${(x1 + (x2 - x1) * t + (nx / len) * k).toFixed(1)} ${(y1 + (y2 - y1) * t + (ny / len) * k).toFixed(1)}`;
  }
  return d;
}

function stickShape(parent) {
  // 以签身中心为原点，签头朝上（y 负方向）。一支签是一笔墨：头重、身匀、尾略收
  const g = el('g', {}, parent);
  const h = STICK_LEN / 2;
  const w = STICK_W / 2;
  const d = `M${-w} ${-h + 3} Q0 ${-h - 2} ${w} ${-h + 3}`
    + ` L${w + rand(-0.4, 0.4)} ${-h / 3} L${w - 0.3} ${h / 3} L${w - 0.8} ${h}`
    + ` L${-w + 0.8} ${h} L${-w + 0.3} ${h / 3} L${-w + rand(-0.4, 0.4)} ${-h / 3} Z`;
  el('path', { d, fill: 'url(#q-stick)' }, g);
  el('path', { d: `M${-w} ${-h + 3} Q0 ${-h - 2} ${w} ${-h + 3} L${w} ${-h + 16} L${-w} ${-h + 16} Z`, fill: '#0e0b08' }, g); // 签头浓墨
  for (const y of [-h + 58, -h + 150]) el('path', { d: `M${-w - 0.5} ${y} L${w + 0.5} ${y + 0.6}`, stroke: '#0e0b08', 'stroke-width': 1.3, opacity: '.8' }, g); // 竹节
  el('path', { d: `M${-w + 1.2} ${-h + 18} L${-w + 1} ${h - 6}`, stroke: '#efe6d0', 'stroke-width': 0.8, opacity: '.28' }, g); // 飞白
  return g;
}

export function createQian(svg, { sfx, reduced = false, onRelease, onLanded }) {
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.replaceChildren();
  defs(svg);

  const tubeShadow = el('ellipse', { cx: PX, cy: FLOOR - 2, rx: 76, ry: 10, fill: 'url(#q-pool)' }, svg);
  const flyShadow = el('ellipse', { cx: PX, cy: FLOOR - 1, rx: 20, ry: 5, fill: 'url(#q-pool)', opacity: '0' }, svg);
  const rig = el('g', {}, svg);

  // 筒口内壁（在签后面）
  el('ellipse', { cx: PX, cy: RIM, rx: (TR - TL) / 2, ry: 12, fill: 'url(#q-mouth)' }, rig);
  el('path', { d: `M${TL} ${RIM} A${(TR - TL) / 2} 12 0 0 1 ${TR} ${RIM}`, fill: 'none', stroke: '#1b1712', 'stroke-width': 2.5 }, rig); // 口沿后半圈
  const sticksG = el('g', {}, rig);
  // 筒身（挡住签的下半截）：宣纸色打底，淡墨晕染
  const bodyPath = `M${TL} ${RIM} V${PY - 20} Q${TL} ${PY} ${TL + 22} ${PY} H${TR - 22} Q${TR} ${PY} ${TR} ${PY - 20} V${RIM} A${(TR - TL) / 2} 12 0 0 1 ${TL} ${RIM} Z`;
  el('path', { d: bodyPath, fill: '#efe6d0' }, rig);
  el('path', { d: bodyPath, fill: 'url(#q-wash)' }, rig);
  el('path', { d: bodyPath, fill: 'url(#q-wash-v)' }, rig);
  // 墨线勾勒：左重右轻，像一笔下来
  el('path', { d: wobble(TL, RIM, TL - 0.5, PY - 18, 1.4), fill: 'none', stroke: '#1b1712', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, rig);
  el('path', { d: wobble(TR, RIM, TR + 0.5, PY - 18, 1.2), fill: 'none', stroke: '#1b1712', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, rig);
  el('path', { d: `M${TL} ${PY - 20} Q${TL} ${PY} ${TL + 22} ${PY} H${TR - 22} Q${TR} ${PY} ${TR} ${PY - 20}`, fill: 'none', stroke: '#1b1712', 'stroke-width': 3, 'stroke-linecap': 'round' }, rig);
  for (const [y, w] of [[RIM + 22, 2.6], [PY - 34, 2]]) {
    el('path', { d: wobble(TL + 2, y, TR - 2, y + 1, 1), fill: 'none', stroke: '#1b1712', 'stroke-width': w, opacity: '.75' }, rig);
  }
  // 朱印
  const brush = "'Ma Shan Zheng','STKaiti','KaiTi',serif";
  const seal = el('g', { transform: `translate(${PX - 22} ${RIM + 72}) rotate(-6 22 22)` }, rig);
  el('rect', { width: 44, height: 44, rx: 3, fill: '#b3261f' }, seal);
  el('rect', { x: 4, y: 4, width: 36, height: 36, rx: 2, fill: 'none', stroke: '#efe6d0', 'stroke-width': 1.5, opacity: '.85' }, seal);
  el('text', { x: 22, y: 20, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 15, fill: '#efe6d0' }, seal).textContent = '天';
  el('text', { x: 22, y: 37, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 15, fill: '#efe6d0' }, seal).textContent = '机';
  // 口沿前半圈
  el('path', { d: `M${TL} ${RIM} A${(TR - TL) / 2} 12 0 0 0 ${TR} ${RIM}`, fill: 'none', stroke: '#1b1712', 'stroke-width': 3.4, 'stroke-linecap': 'round' }, rig);

  const flyG = el('g', { opacity: '0' }, svg);
  stickShape(flyG);
  const labelEl = el('text', { x: PX, y: FLOOR - 30, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 24, fill: '#1b1712', opacity: '0' }, svg);
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
    tubeShadow.setAttribute('opacity', '1');
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
    for (let i = 0; i < 14; i++) {
      const c = el('circle', { r: rand(0.8, 2.8).toFixed(2), fill: '#1b1712' }, dustG);
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
      if (p.age >= p.life) return false; // 墨点停在纸上，不再更新
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
      p.c.setAttribute('opacity', p.y >= FLOOR - 1.5 ? '.85' : (1 - (p.age / p.life) * 0.3).toFixed(2)); // 墨点落纸即留下
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
