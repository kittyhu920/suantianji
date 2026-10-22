// 兆纹生成：卜卷最“算法艺术”的一处。裂纹就是算法。
//
//   makeCrack(seed, energy) → crack    纯函数，不碰 DOM；同一个 (seed, energy) 永远得到同一道兆
//   paintCrack(g, crack, opts)         把兆画到 Canvas 上（网页、命盘旁的兆图、分享图共用这一个函数）
//   crackSignature(crack)              几何的指纹；用来核对“页面上的兆”与“分享图里的兆”是同一道
//
// 局部坐标：原点在钻凿处，x 向右，y 向下，兆干纵向向上生长（-y），名义长 L0 = 100。
// 兆枝从兆干的侧面横出，默认朝 +x；画的时候翻一下（flip）就朝 -x。兆象由 omen.js 按 metrics 判定。
//
// 生长：先沿一条带摆动的曲线长出兆干，到枝的分出点时兆枝开始横出，随后细碎的分叉与发丝般的细纹陆续裂开。
// 每一条裂纹有自己的 start / dur（0..1 的时间轴），paintCrack 的 t 就是这条时间轴上的进度。

import { mulberry32 } from '../../core/rng.js';
import { classify } from './omen.js';

export const L0 = 100;
const DEG = Math.PI / 180;
const STEP = 3.4;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - (1 - t) ** 2.4;

// 沿着方向走一步，y 轴向下，所以“向上”是 -y
function walk(rand, o) {
  const { x0, y0, dir0, len, w0, w1, curve = 0, sway = 0, rough = 1.4, gapP = 0, minGap = 0.35, maxGap = 0.85 } = o;
  const n = Math.max(3, Math.round(len / STEP));
  const p1 = rand() * 6.28, p2 = rand() * 6.28;
  const k1 = 1.2 + rand() * 1.6, k2 = 3 + rand() * 3;
  const pts = [];
  let x = x0, y = y0;
  let dir = dir0;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const taper = lerp(w0, w1, s ** 0.8);
    // 笔压式的粗细起伏，另有一点随机
    const wob = 0.82 + 0.3 * Math.sin(s * 9 + p1) * Math.sin(s * 3.1 + p2) + (rand() - 0.5) * 0.18;
    pts.push({ x, y, w: Math.max(0.28, taper * wob), gap: false });
    const turn = curve * DEG * (0.6 + s) + sway * DEG * (Math.sin(s * k1 * 6.28 + p1) * 0.7 + Math.sin(s * k2 * 6.28 + p2) * 0.3) * 0.5 + (rand() - 0.5) * rough * DEG;
    dir += turn;
    x += Math.cos(dir) * STEP;
    y -= Math.sin(dir) * STEP;
  }
  // 断口：裂纹中断一小段，又在不远处接上
  let gaps = 0;
  if (rand() < gapP && n > 10) {
    const at = Math.floor(n * lerp(minGap, maxGap, rand()));
    const glen = 2 + (rand() < 0.4 ? 1 : 0);
    for (let k = 0; k < glen && at + k < n; k++) pts[at + k].gap = true; // 第 i 点到第 i+1 点之间不画
    const nudge = (rand() - 0.5) * 3.2;
    for (let i = at + glen; i <= n; i++) pts[i].x += nudge;
    gaps = 1;
  }
  return { pts, gaps };
}

function arcLen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

function stroke(kind, pts, start, dur, depth, extra = {}) {
  return { kind, pts, start, dur, depth, len: arcLen(pts), ...extra };
}

function dirAt(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  return Math.atan2(-(b.y - a.y), b.x - a.x);
}

// 一条裂纹上生出细碎的分叉
function forksOf(rand, parent, count, sc, tag) {
  const out = [];
  for (let f = 0; f < count; f++) {
    const idx = Math.floor(parent.pts.length * lerp(0.25, 0.88, rand()));
    const base = parent.pts[idx];
    const side = rand() < 0.5 ? -1 : 1;
    const dir = dirAt(parent.pts, idx) + side * lerp(28, 62, rand()) * DEG;
    const len = lerp(8, 26, rand()) * sc;
    const { pts } = walk(rand, { x0: base.x, y0: base.y, dir0: dir, len, w0: Math.max(0.9, base.w * 0.62), w1: 0.4, curve: (rand() - 0.5) * 6, rough: 3 });
    const fk = stroke(tag, pts, parent.start + parent.dur * (idx / parent.pts.length) * 0.9, 0.22, parent.depth * 0.9);
    out.push(fk);
    // 分叉上再偶尔裂出一道极短的
    if (rand() < 0.4) {
      const j = Math.floor(pts.length * lerp(0.3, 0.7, rand()));
      const b2 = pts[j];
      const d2 = dirAt(pts, j) + (rand() < 0.5 ? -1 : 1) * lerp(25, 55, rand()) * DEG;
      const { pts: p2 } = walk(rand, { x0: b2.x, y0: b2.y, dir0: d2, len: lerp(4, 9, rand()) * sc, w0: 0.7, w1: 0.3, rough: 3 });
      out.push(stroke('tiny', p2, fk.start + fk.dur * (j / pts.length), 0.12, parent.depth * 0.8));
    }
  }
  return out;
}

// 分叉数的分布：多数 0–2 处，偶尔更多
const forkCount = (u, max) => Math.min(max, u < 0.28 ? 0 : u < 0.6 ? 1 : u < 0.83 ? 2 : u < 0.95 ? 3 : 4);

/**
 * 生成一道兆。
 * @param {number} seed   种子（取自按压时长、按压时的抖动和时间，见 game.svelte.js）
 * @param {number} energy 0..1，灼得越久裂得越大一点（只影响整体大小，不影响兆象）
 */
export function makeCrack(seed, energy = 0) {
  const rand = mulberry32(seed >>> 0);
  const sc = 0.92 + 0.16 * clamp(energy, 0, 1);

  // 兆干：纵向，带摆动，粗细渐收
  const trunkLen = L0 * sc * lerp(0.92, 1.08, rand());
  const trunk = walk(rand, {
    x0: 0, y0: 0, dir0: (90 + (rand() - 0.5) * 5) * DEG, len: trunkLen,
    w0: lerp(3.6, 4.6, rand()), w1: 1.3, curve: (rand() - 0.5) * 2.4, sway: lerp(2, 7, rand()), rough: 1.6,
    gapP: 0.13, minGap: 0.45, maxGap: 0.9,
  });
  const T = stroke('trunk', trunk.pts, 0, 0.52, lerp(0.82, 1, rand()));

  // 兆枝：从兆干的 0.42–0.6 处向侧面横出。角度以水平为 0，向上为正；三角分布，多数略微上扬
  const f = lerp(0.42, 0.6, rand());
  const bi = Math.floor(T.pts.length * f);
  const bp = T.pts[bi];
  const ang0 = ((rand() + rand() - 1) * 50 + 14);
  const bLen = trunkLen * lerp(0.3, 0.85, rand());
  const bcurve = (rand() - 0.5) * 7;
  const branch = walk(rand, {
    x0: bp.x, y0: bp.y, dir0: ang0 * DEG, len: bLen,
    w0: lerp(3.0, 3.8, rand()), w1: 1.0, curve: bcurve, sway: lerp(1, 5, rand()), rough: 2,
    gapP: 0.15, minGap: 0.35, maxGap: 0.85,
  });
  const B = stroke('branch', branch.pts, T.dur * f * 0.92, 0.42, lerp(0.8, 1, rand()));

  const strokes = [T, B];
  // 细碎的分叉：兆枝上的算兆象，兆干上的只做装饰
  const branchForks = forkCount(rand(), 4);
  const trunkForks = Math.min(2, forkCount(rand(), 3));
  strokes.push(...forksOf(rand, B, branchForks, sc, 'bfork'));
  strokes.push(...forksOf(rand, T, trunkForks, sc, 'tfork'));

  // 发丝般的细纹：灼裂时的碎纹，不参与兆象
  const hair = 5 + Math.floor(rand() * 7);
  const hosts = [T, B];
  for (let h = 0; h < hair; h++) {
    const host = hosts[Math.floor(rand() * 2)];
    const idx = Math.floor(host.pts.length * lerp(0.1, 0.95, rand()));
    const base = host.pts[idx];
    const off = (rand() - 0.5) * 9;
    const { pts } = walk(rand, { x0: base.x + off, y0: base.y + (rand() - 0.5) * 5, dir0: rand() * 6.28, len: lerp(3, 9, rand()) * sc, w0: 0.7, w1: 0.3, rough: 5 });
    strokes.push(stroke('hair', pts, 0.4 + rand() * 0.5, 0.1, 0.5));
  }

  // 度量：兆象只看这几个数
  const end = B.pts[B.pts.length - 1];
  const ang = Math.atan2(-(end.y - bp.y), end.x - bp.x) / DEG;
  const metrics = {
    ang: +ang.toFixed(1), // 兆枝整体的方向，水平为 0，向上为正
    ratio: +(B.len / T.len).toFixed(3), // 兆枝长 / 兆干长
    forks: branchForks, // 兆枝上的分叉数
    gaps: branch.gaps, // 兆枝上的断口数
    trunkGaps: trunk.gaps, // 兆干上的断口数
    f: +f.toFixed(2), // 兆枝从兆干的哪一处分出
  };
  return { seed: seed >>> 0, energy: +clamp(energy, 0, 1).toFixed(3), sc, strokes, metrics, omen: classify(metrics) };
}

/** 几何指纹：把所有点取整后求哈希。页面、分享图、命盘旁的兆都从同一份数据画，指纹相同 */
export function crackSignature(crack) {
  let h = 2166136261;
  for (const s of crack.strokes) {
    for (const p of s.pts) {
      for (const v of [Math.round(p.x * 10), Math.round(p.y * 10), Math.round(p.w * 10), p.gap ? 1 : 0]) {
        h ^= v & 0xffff;
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
}

// 取一条裂纹长到 s（弧长）为止的点；最后一段按比例截断
function partial(pts, s) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d >= s) {
      const u = d ? (s - acc) / d : 0;
      out.push({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), gap: a.gap });
      return out;
    }
    acc += d;
    out.push(b);
  }
  return out;
}

// 把点列按断口切成若干段
function runs(pts) {
  const out = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    cur.push(pts[i]);
    if (pts[i].gap || i === pts.length - 1) {
      if (cur.length > 1) out.push(cur);
      cur = [pts[i + 1]].filter(Boolean);
    }
  }
  return out;
}

function ribbon(g, run) {
  const L = [], R = [];
  for (let i = 0; i < run.length; i++) {
    const a = run[Math.max(0, i - 1)], b = run[Math.min(run.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const w = run[i].w / 2;
    L.push([run[i].x + nx * w, run[i].y + ny * w]);
    R.push([run[i].x - nx * w, run[i].y - ny * w]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
}

export const HEAT = [168, 84, 52]; // 低饱和的赭红：炭火与刚裂开的裂缝尖端；不是朱

/**
 * 把兆画到 Canvas。
 * @param {object} o
 * @param {number} o.x,o.y   钻凿处在画布上的位置（CSS 像素，已含 dpr 时由调用者先 scale）
 * @param {number} o.k       放大倍数
 * @param {number} o.t       生长进度 0..1（1 为长全）
 * @param {boolean} o.flip   朝左（兆枝向 -x 横出）
 * @param {number} o.alpha   整体不透明度（命盘旁的缩略、分享图可以淡些）
 * @param {boolean} o.glow   生长中，裂纹尖端泛赭红
 * @param {boolean} o.halo   裂纹两侧的淡墨晕（缩略图可关）
 */
export function paintCrack(g, crack, { x, y, k = 1, t = 1, flip = false, alpha = 1, glow = true, halo = true } = {}) {
  g.save();
  g.translate(x, y);
  g.scale(flip ? -k : k, k);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const heads = [];
  for (const s of crack.strokes) {
    const p = clamp((t - s.start) / s.dur, 0, 1);
    if (p <= 0) continue;
    const e = ease(p);
    const pts = e >= 1 ? s.pts : partial(s.pts, s.len * e);
    if (pts.length < 2) continue;
    const a = s.depth * alpha;
    const main = s.kind === 'trunk' || s.kind === 'branch';
    const segs = runs(pts);
    if (halo && (main || s.kind === 'bfork' || s.kind === 'tfork')) {
      g.strokeStyle = `rgba(70,48,28,${(0.1 * a).toFixed(3)})`;
      g.lineWidth = (main ? 7.5 : 4.2);
      g.beginPath();
      for (const run of segs) { g.moveTo(run[0].x, run[0].y); for (let i = 1; i < run.length; i++) g.lineTo(run[i].x, run[i].y); }
      g.stroke();
    }
    g.fillStyle = `rgba(27,20,14,${((s.kind === 'hair' ? 0.5 : 0.9) * a).toFixed(3)})`;
    for (const run of segs) if (run.length > 1) ribbon(g, run);
    if (main) { // 裂缝里的一线浅色，像刻出来的深度
      g.strokeStyle = `rgba(239,230,208,${(0.32 * a).toFixed(3)})`;
      g.lineWidth = 0.35;
      g.beginPath();
      for (const run of segs) { g.moveTo(run[0].x - 0.5, run[0].y); for (let i = 1; i < run.length; i++) g.lineTo(run[i].x - 0.5, run[i].y); }
      g.stroke();
    }
    if (glow && p < 1 && s.kind !== 'hair') heads.push({ p: pts[pts.length - 1], q: p });
  }
  // 正在生长的裂纹尖端：一点赭红的余热
  for (const h of heads) {
    const r = 9;
    const gr = g.createRadialGradient(h.p.x, h.p.y, 0, h.p.x, h.p.y, r);
    gr.addColorStop(0, `rgba(${HEAT[0]},${HEAT[1]},${HEAT[2]},${(0.6 * (1 - h.q) * alpha).toFixed(3)})`);
    gr.addColorStop(1, `rgba(${HEAT[0]},${HEAT[1]},${HEAT[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(h.p.x - r, h.p.y - r, r * 2, r * 2);
  }
  g.restore();
}

/** 兆的外包围盒（局部坐标，未翻转），用来在画布里摆放 */
export function crackBounds(crack) {
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (const s of crack.strokes) for (const p of s.pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return { x0, x1, y0, y1 };
}
