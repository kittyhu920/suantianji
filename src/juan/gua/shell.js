// 摇卦：水墨龟壳 + 三枚铜钱 + 摇动控制（约束见 docs/DESIGN.md §5、§6：写意的画，真实的动）
// 运动中的器物不用 SVG 滤镜（每帧重算太卡），笔意靠不规则路径与墨色渐变。
// 龟壳绕壳底转动，倾角由弹簧追随输入；三枚铜钱在壳里受力跳动，落回壳底即是一声"叮"；
// 摇动累积能量，满了铜钱就从壳口飞出，受重力落地、弹跳、旋转着摇摆几下，躺平。
// 落定的朝向不是物理"算"出来的，而是出手那一刻就掷好了：每枚铜钱飞行时转过整数个半圈，
// 落地后只在原地摇摆衰减（像一枚旋转的硬币慢慢停下），所以看到的和记下的一定一致。
// 接口与 src/juan/qian/tube.js 相同（press / move / release / motion / active / start / stop），
// 公共的摇动控制 core/shake.svelte.js 拿它当器物用。

const NS = 'http://www.w3.org/2000/svg';
const VW = 320;
const VH = 440;
const PX = 160; // 转轴：壳底中心
const PY = 262;
const RIM = 162; // 壳口
const SL = 82; // 壳左右
const SR = 238;
const R = 25; // 铜钱半径
const REST = 392; // 铜钱躺平时的圆心高度
const SLOTS = [68, 160, 252]; // 三枚铜钱大致落在哪里

const G = 2400; // 重力 px/s²
const K = 90; // 倾角弹簧
const C = 12; // 倾角阻尼
const BOUNCE = 0.35;
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
const brush = "'Ma Shan Zheng','STKaiti','KaiTi',serif";

function defs(svg) {
  const d = el('defs', {}, svg);
  d.innerHTML = `
    <linearGradient id="c-wash" x1="0" x2="1">
      <stop offset="0" stop-color="var(--obj-ink)" stop-opacity=".9"/><stop offset=".2" stop-color="var(--obj-ink2)" stop-opacity=".6"/>
      <stop offset=".45" stop-color="var(--obj-mid)" stop-opacity=".2"/><stop offset=".65" stop-color="var(--obj-mid2)" stop-opacity=".1"/>
      <stop offset=".88" stop-color="var(--obj-ink3)" stop-opacity=".5"/><stop offset="1" stop-color="var(--obj-ink)" stop-opacity=".86"/>
    </linearGradient>
    <linearGradient id="c-wash-v" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--obj-ink)" stop-opacity="0"/><stop offset=".6" stop-color="var(--obj-ink)" stop-opacity=".1"/><stop offset="1" stop-color="var(--obj-ink)" stop-opacity=".36"/>
    </linearGradient>
    <radialGradient id="c-mouth" cx=".5" cy=".4" r=".6">
      <stop offset="0" stop-color="var(--obj-ink2)"/><stop offset="1" stop-color="var(--obj-ink)"/>
    </radialGradient>
    <radialGradient id="c-metal" cx=".4" cy=".35" r=".8">
      <stop offset="0" stop-color="#a69d86"/><stop offset=".6" stop-color="#7d7460"/><stop offset="1" stop-color="#5a5243"/>
    </radialGradient>
    <radialGradient id="c-pool" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="var(--obj-pool)" stop-opacity=".2"/><stop offset="1" stop-color="var(--obj-pool)" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="c-blot" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="var(--obj-pool)" stop-opacity=".22"/><stop offset="1" stop-color="var(--obj-pool)" stop-opacity="0"/>
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

// 一枚铜钱：旧铜低饱和的色，墨线勾边。字面（字）四周是"天机通宝"四字，背面（背）光素，只有星月。
// 以圆心为原点。face / back 两个组，按翻转的角度切换。
function makeCoin(parent) {
  const g = el('g', {}, parent);
  const edge = el('rect', { x: -R, y: -3.4, width: 2 * R, height: 6.8, rx: 3.4, fill: 'var(--obj-ink2)' }, g);
  const flip = el('g', {}, g);
  const face = el('g', {}, flip);
  const back = el('g', {}, flip);
  const ring = `M${-R} 0 a${R} ${R} 0 1 0 ${2 * R} 0 a${R} ${R} 0 1 0 ${-2 * R} 0 Z`;
  const hole = 'M-6.5 -6.5 h13 v13 h-13 Z';
  for (const side of [face, back]) {
    el('path', { d: `${ring} ${hole}`, 'fill-rule': 'evenodd', fill: 'url(#c-metal)' }, side);
    el('circle', { r: R, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 1.8 }, side);
    el('circle', { r: R - 3.4, fill: 'none', stroke: 'var(--obj-ink2)', 'stroke-width': 1.1, opacity: '.55' }, side);
    el('rect', { x: -6.5, y: -6.5, width: 13, height: 13, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, side);
    el('rect', { x: -9.5, y: -9.5, width: 19, height: 19, fill: 'none', stroke: 'var(--obj-ink2)', 'stroke-width': 1, opacity: '.5' }, side);
    el('path', { d: 'M-15 -17 Q0 -23 15 -17', fill: 'none', stroke: 'var(--obj-hi)', 'stroke-width': 1.2, opacity: '.28', 'stroke-linecap': 'round' }, side); // 高光
  }
  // 字面：上下右左，读作"天机通宝"
  [['天', 0, -10.6], ['机', 0, 19.4], ['通', 14.4, 4.4], ['宝', -14.4, 4.4]].forEach(([ch, x, y]) => {
    el('text', { x, y, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 11.5, fill: 'var(--obj-ink)', opacity: '.9' }, face).textContent = ch;
  });
  // 背面：上一点是星，右下一弯是月
  el('circle', { cx: 0, cy: -15, r: 1.7, fill: 'var(--obj-ink)', opacity: '.8' }, back);
  el('path', { d: 'M9 14 Q16 12 16 5 Q12 9 9 14 Z', fill: 'var(--obj-ink)', opacity: '.75' }, back);
  return { g, edge, flip, face, back };
}

function setCoin(c, x, y, z, th) {
  const cos = Math.cos(th);
  const s = Math.max(Math.abs(cos), 0.07);
  c.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${z.toFixed(1)})`);
  c.flip.setAttribute('transform', `scale(1 ${s.toFixed(3)})`);
  c.face.setAttribute('display', cos >= 0 ? 'inline' : 'none');
  c.back.setAttribute('display', cos >= 0 ? 'none' : 'inline');
  c.edge.setAttribute('opacity', clamp(1 - Math.abs(cos) * 4, 0, 1).toFixed(2));
}

export function createShell(svg, { sfx, reduced = false, onRelease, onLanded }) {
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  svg.replaceChildren();
  defs(svg);

  el('ellipse', { cx: PX, cy: REST + 6, rx: 150, ry: 30, fill: 'url(#c-pool)' }, svg); // 落钱的地方，一片淡墨
  const shellShadow = el('ellipse', { cx: PX, cy: PY + 8, rx: 84, ry: 11, fill: 'url(#c-pool)' }, svg);
  const rig = el('g', {}, svg);

  // 壳口内壁（在钱后面）
  el('ellipse', { cx: PX, cy: RIM, rx: (SR - SL) / 2, ry: 13, fill: 'url(#c-mouth)' }, rig);
  el('path', { d: `M${SL} ${RIM} A${(SR - SL) / 2} 13 0 0 1 ${SR} ${RIM}`, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 3 }, rig);
  const innerG = el('g', {}, rig); // 壳里的三枚钱
  const inside = [0, 1, 2].map((i) => ({ coin: makeCoin(innerG), dx: (i - 1) * 40 + rand(-3, 3), o: 0, v: 0, th: 1.15, z: rand(-25, 25), s: rand(0.8, 1.05) }));

  // 壳身（挡住钱的下半截）：宣纸色打底，淡墨晕染，几块盾片的接缝
  const body = `M${SL} ${RIM} C${SL - 4} 214 ${PX - 44} ${PY} ${PX} ${PY} C${PX + 44} ${PY} ${SR + 4} 214 ${SR} ${RIM} A${(SR - SL) / 2} 13 0 0 1 ${SL} ${RIM} Z`;
  el('path', { d: body, fill: 'var(--obj-body)' }, rig);
  el('path', { d: body, fill: 'url(#c-wash)' }, rig);
  el('path', { d: body, fill: 'url(#c-wash-v)' }, rig);
  // 背甲：六角的盾片（龟背纹）。尖顶六边形，一排排错开，被壳身的轮廓裁齐；每片的墨色深浅不同
  const clip = el('clipPath', { id: 'c-body' }, rig);
  el('path', { d: body }, clip);
  const plates = el('g', { 'clip-path': 'url(#c-body)' }, rig);
  const HX = 30; // 盾片半宽
  const HY = 17; // 盾片顶点到中心
  [[188, [100, 160, 220]], [213.5, [70, 130, 190, 250]], [239, [100, 160, 220]], [264.5, [130, 190]]].forEach(([cy, xs]) => {
    xs.forEach((cx) => {
      const j = () => rand(-1.3, 1.3);
      const pts = [[0, -HY], [HX, -HY / 2], [HX, HY / 2], [0, HY], [-HX, HY / 2], [-HX, -HY / 2]].map(([x, y]) => `${(cx + x + j()).toFixed(1)} ${(cy + y + j()).toFixed(1)}`);
      el('path', { d: `M${pts.join(' L')} Z`, fill: 'var(--obj-ink)', 'fill-opacity': rand(0.04, 0.2).toFixed(2), stroke: 'var(--obj-ink)', 'stroke-width': rand(1.5, 2.3).toFixed(1), 'stroke-opacity': '.72', 'stroke-linejoin': 'round' }, plates);
      el('path', { d: `M${cx - 8 + j()} ${cy + 1} Q${cx} ${cy - 4} ${cx + 8 + j()} ${cy + 1}`, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 0.9, opacity: '.35' }, plates);
    });
  });
  // 边缘：沿壳口下面一圈小的缘盾，一格一格
  const rimY = (x) => RIM + 13 * Math.sqrt(Math.max(0, 1 - ((x - PX) / ((SR - SL) / 2)) ** 2));
  let marg = '';
  for (let k = 0; k <= 14; k++) {
    const x = SL + ((SR - SL) * k) / 14;
    const y = rimY(x);
    marg += `M${x.toFixed(1)} ${y.toFixed(1)} L${(x + (x - PX) * 0.02).toFixed(1)} ${(y + 11).toFixed(1)} `;
  }
  el('path', { d: marg, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 1.7, opacity: '.7', 'stroke-linecap': 'round' }, rig);
  el('path', { d: `M${SL + 1} ${RIM + 11} A${(SR - SL) / 2 - 1} 13 0 0 0 ${SR - 1} ${RIM + 11}`, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 2, opacity: '.75', 'stroke-linecap': 'round' }, rig);
  // 墨线勾勒：左重右轻
  el('path', { d: wobble(SL, RIM, SL - 3, 196, 1.2, 7), fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, rig);
  el('path', { d: `M${SL - 3} 196 C${SL + 4} 238 ${PX - 44} ${PY} ${PX} ${PY} C${PX + 44} ${PY} ${SR + 2} 232 ${SR + 2} 190`, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 3, 'stroke-linecap': 'round' }, rig);
  el('path', { d: wobble(SR, RIM, SR + 2, 190, 1, 6), fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, rig);

  // 朱印：外缘不规则、内框断续、朱面剥蚀。壳在转，不能用滤镜，所以用静态的不规则路径与碎点，生成时只算一次
  const seal = el('g', { transform: `translate(${PX + 20} ${RIM + 56}) rotate(7 18 18)` }, rig);
  let edgeD = '';
  const sideTo = (ax, ay, bx, by) => {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const j = rand(-0.8, 0.8);
      const nx = -(by - ay) / 36;
      const ny = (bx - ax) / 36;
      edgeD += `${edgeD ? 'L' : 'M'}${(ax + (bx - ax) * t + nx * j).toFixed(1)} ${(ay + (by - ay) * t + ny * j).toFixed(1)} `;
    }
  };
  sideTo(0, 0, 36, 0); sideTo(36, 0, 36, 36); sideTo(36, 36, 0, 36); sideTo(0, 36, 0, 0);
  el('path', { d: `${edgeD}Z`, fill: '#b3261f', 'stroke-linejoin': 'round' }, seal);
  el('rect', { x: 3.5, y: 3.5, width: 29, height: 29, rx: 2, fill: 'none', stroke: '#efe6d0', 'stroke-width': 1.3, opacity: '.85', 'stroke-dasharray': '20 2 12 2 16 3' }, seal);
  for (let i = 0; i < 56; i++) {
    const px = Math.random();
    const py = Math.random();
    const near = 1 - Math.min(px, 1 - px, py, 1 - py) * 2;
    if (Math.random() > 0.05 + 0.85 * near ** 3) continue;
    el('circle', { cx: (px * 36).toFixed(1), cy: (py * 36).toFixed(1), r: rand(0.35, 0.95).toFixed(2), fill: '#efe6d0', opacity: rand(0.5, 0.95).toFixed(2) }, seal);
  }
  el('text', { x: 18, y: 16.5, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 13, fill: '#efe6d0' }, seal).textContent = '天';
  el('text', { x: 18, y: 31, 'text-anchor': 'middle', 'font-family': brush, 'font-size': 13, fill: '#efe6d0' }, seal).textContent = '机';
  // 口沿前半圈
  el('path', { d: `M${SL} ${RIM} A${(SR - SL) / 2} 13 0 0 0 ${SR} ${RIM}`, fill: 'none', stroke: 'var(--obj-ink)', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, rig);

  // 飞出来的三枚钱，与它们落在纸上的影
  const shadows = [0, 1, 2].map(() => el('ellipse', { rx: R * 0.9, ry: 6, fill: 'url(#c-pool)', opacity: '0' }, svg));
  const flyG = el('g', {}, svg);
  const flying = [0, 1, 2].map(() => ({ coin: makeCoin(flyG) }));
  flyG.setAttribute('opacity', '0');
  const dustG = el('g', {}, svg);

  let st;

  function reset() {
    st = {
      a: 0, av: 0, prevAv: 0, target: 0,
      energy: 0,
      mode: 'idle', // idle | drag | auto
      startX: 0, lastX: 0, lastT: 0, dragV: 0, heldAt: 0, moved: false,
      motionRate: 0, motionAt: 0, motionKick: 0, activeMs: 0,
      phase: 'shake', // shake | fly | done
      faces: null, dust: [], lastClack: 0, lastBuzz: 0, t: 0,
    };
    inside.forEach((c) => { c.o = 0; c.v = 0; c.th = 1.15; });
    rig.style.transition = '';
    rig.setAttribute('opacity', '1');
    shellShadow.setAttribute('opacity', '1');
    flyG.setAttribute('opacity', '0');
    shadows.forEach((s) => s.setAttribute('opacity', '0'));
    innerG.setAttribute('opacity', '1');
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
    if (st.phase === 'fly') return false;
    if (st.phase === 'done') reset(); // 上一掷的钱收回壳里，重新摇
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
    else if (st.phase === 'fly') flyStep(dt);
    else if (st.phase === 'done') {
      // 掷完之后，壳慢慢回正
      const aa = K * (0 - st.a) - C * st.av;
      st.av += aa * dt;
      st.a += st.av * dt;
    }
    dustStep(dt);
  }

  function shakeStep(dt) {
    let rate = 0;
    const now = performance.now();
    if (st.mode === 'drag' && !st.moved && now - st.heldAt > 350) st.mode = 'auto'; // 按住不动：自己轻摇
    if (st.mode === 'auto') {
      st.target = 20 * Math.sin(st.t * 2 * Math.PI * 1.7) + 4 * Math.sin(st.t * 17);
      rate = 0.4; // 铜钱比竹签轻，摇起来快一些
    } else if (st.mode === 'drag') {
      rate = Math.min(0.7, st.dragV / 1800);
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

    // 壳里的钱：随晃动被抛起，落回壳底就是一声叮
    for (const c of inside) {
      if (kick > 20 && Math.random() < dt * 11) { c.v -= rand(0.3, 1) * kick; c.th += rand(-0.5, 0.5); }
      c.v += G * dt;
      c.o += c.v * dt;
      if (c.o < -46) { c.o = -46; c.v = Math.max(0, c.v); }
      if (c.o > 0) {
        if (c.v > 90 && st.t - st.lastClack > 0.04) {
          st.lastClack = st.t;
          sfx?.clack(Math.min(1, c.v / 320) * 0.8);
          sfx?.bronze?.(rand(1500, 2300), 0.22, Math.min(0.05, c.v / 9000));
          buzz(6, 0.06);
        }
        c.o = 0;
        c.v = -c.v * 0.25;
      }
      c.th += (1.15 - c.th) * Math.min(1, dt * 6);
    }
    if (st.energy >= 1) launch();
  }

  // 壳里某一点，随壳转过之后在画面上的位置
  function world(px, py) {
    const r = rad(st.a);
    const dx = px - PX;
    const dy = py - PY;
    return { x: PX + dx * Math.cos(r) - dy * Math.sin(r), y: PY + dx * Math.sin(r) + dy * Math.cos(r) };
  }

  function launch() {
    const faces = onRelease?.() ?? ['zi', 'zi', 'zi']; // 掷出的朝向在出手这一刻就定了
    st.faces = faces;
    const r = rad(st.a);
    st.coins = flying.map((f, i) => {
      const w = world(PX + inside[i].dx, RIM + 8 + inside[i].o);
      const vy0 = -rand(560, 700) * Math.cos(r * 0.6);
      const T1 = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * (REST - w.y))) / G; // 到第一次落地的时间
      const tx = clamp(SLOTS[i] + Math.sin(r) * 70 + rand(-14, 14), R + 6, VW - R - 6);
      const th0 = inside[i].th;
      const half = 2 * Math.floor(rand(2, 5)) + (faces[i] === 'bei' ? 1 : 0); // 字面朝上转偶数个半圈，背面朝上转奇数个
      return {
        f, x: w.x, y: w.y, vx: (tx - w.x) / T1, vy: vy0, th: th0, w: (half * Math.PI - th0) / T1,
        end: half * Math.PI, z: inside[i].z + rand(-30, 30), zw: rand(-90, 90),
        hits: 0, tw: 0, wobA: 0, wobW: rand(17, 22), done: false,
      };
    });
    flyG.setAttribute('opacity', '1');
    innerG.setAttribute('opacity', '0');
    rig.setAttribute('opacity', '.9');
    st.phase = 'fly';
    st.pourDir = Math.abs(st.a) > 3 ? Math.sign(st.a) : (Math.random() < 0.5 ? -1 : 1);
    st.pourT = 0;
    st.target = 0;
    if (reduced) settleNow();
  }

  function flyStep(dt) {
    // 倒出来时壳先向一侧倾倒，钱出尽了再慢慢回正
    st.pourT += dt;
    const aim = st.pourT < 0.5 ? st.pourDir * 64 : 0;
    const aa = K * (aim - st.a) - C * st.av;
    st.av += aa * dt;
    st.a += st.av * dt;
    for (const c of st.coins) {
      if (c.done) continue;
      if (c.rest) { c.vy = 0; c.y = REST; } else { c.vy += G * dt; c.y += c.vy * dt; }
      c.x += c.vx * dt;
      if (c.hits === 0) {
        c.th += c.w * dt;
        c.z += c.zw * dt;
      } else {
        c.tw += dt;
        c.th = c.end + c.wobA * Math.exp(-4.5 * c.tw) * Math.sin(c.wobW * c.tw);
        c.zw *= 1 - Math.min(1, 3 * dt);
        c.z += c.zw * dt;
        c.vx *= 1 - Math.min(1, 5 * dt);
      }
      if (!c.rest && c.y >= REST && c.vy > 0) {
        c.y = REST;
        const impact = c.vy;
        c.hits++;
        if (c.hits === 1) {
          c.th = c.end;
          c.wobA = rand(0.5, 0.85) * clamp(0.4 + impact / 1500, 0.4, 1);
          c.vx *= 0.25;
          burst(c.x, REST + R * 0.6, Math.min(1, impact / 1100));
        }
        sfx?.clack(Math.min(1, impact / 900) * 0.7);
        sfx?.bronze?.(rand(1400, 2400), 0.3, Math.min(0.06, impact / 15000));
        buzz(c.hits === 1 ? 18 : 6, 0.04);
        c.vy = -impact * BOUNCE;
        if (Math.abs(c.vy) < 70) { c.vy = 0; c.rest = true; }
      }
      if (c.rest && c.hits > 0 && c.wobA * Math.exp(-4.5 * c.tw) < 0.02) {
        c.th = c.end;
        c.done = true;
      }
    }
    if (st.coins.every((c) => c.done)) done();
  }

  function settleNow() {
    st.coins.forEach((c, i) => {
      c.x = SLOTS[i];
      c.y = REST;
      c.th = c.end;
      c.done = true;
    });
    sfx?.clack(0.8);
    done();
  }

  function done() {
    if (st.phase === 'done') return;
    st.phase = 'done';
    rig.style.transition = 'opacity .5s';
    rig.setAttribute('opacity', '.28');
    shellShadow.setAttribute('opacity', '.2');
    draw();
    const coins = st.coins.map((c, i) => ({ x: c.x, y: c.y, face: st.faces[i] }));
    setTimeout(() => onLanded?.({ activeMs: st.activeMs, coins }), reduced ? 300 : 500);
  }

  function burst(x, y, power) {
    for (let i = 0; i < 7; i++) {
      const c = el('circle', { fill: 'var(--obj-ink)' }, dustG);
      const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(60, 220) * (0.5 + power);
      st.dust.push({ c, r0: rand(0.8, 2.4), spread: 0, landed: false, x: x + rand(-18, 18), y: y - 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rand(0.35, 0.7), age: 0 });
    }
  }
  function dustStep(dt) {
    st.dust = st.dust.filter((p) => {
      p.age += dt;
      if (!p.landed) {
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y = Math.min(REST + R, p.y + p.vy * dt);
        if (p.y >= REST + R || p.age >= p.life) { p.landed = true; p.vx = p.vy = 0; }
        return true;
      }
      p.spread = Math.min(1, p.spread + dt * 3.5);
      if (p.spread < 1) return true;
      p.c.setAttribute('r', (p.r0 * 1.9).toFixed(2));
      return false;
    });
  }

  /* ───── 绘制 ───── */
  function draw() {
    rig.setAttribute('transform', `rotate(${st.a.toFixed(2)} ${PX} ${PY})`);
    shellShadow.setAttribute('cx', (PX + Math.sin(rad(st.a)) * 30).toFixed(1));
    shellShadow.setAttribute('rx', (80 + Math.abs(st.a) * 0.6).toFixed(1));
    if (st.phase === 'shake') {
      for (const c of inside) setCoin(c.coin, PX + c.dx, RIM + 8 + c.o, c.z, c.th);
      // 满了的时候，钱快要冒出来
      innerG.setAttribute('transform', `translate(0 ${(-st.energy * 8).toFixed(1)})`);
    }
    if (st.coins) {
      st.coins.forEach((c, i) => {
        setCoin(c.f.coin, c.x, c.y, c.z, c.th);
        const h = clamp((REST - c.y) / 260, 0, 1);
        shadows[i].setAttribute('cx', c.x.toFixed(1));
        shadows[i].setAttribute('cy', (REST + R * 0.75).toFixed(1));
        shadows[i].setAttribute('opacity', (0.7 * (1 - h)).toFixed(2));
      });
    }
    for (const p of st.dust) {
      p.c.setAttribute('cx', p.x.toFixed(1));
      p.c.setAttribute('cy', p.y.toFixed(1));
      p.c.setAttribute('r', (p.r0 * (1 + 0.9 * p.spread)).toFixed(2));
      p.c.setAttribute('opacity', p.landed ? (0.8 - 0.25 * p.spread).toFixed(2) : '0.9');
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
