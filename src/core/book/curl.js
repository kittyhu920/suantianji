// 翻页的曲面（docs/DESIGN.md §19）：一张纸是一个细分的平面网格，按拖动点做圆柱或锥面的卷曲变形。纯数学，不碰 three.js。
//
// 纸平放在右边（x 从书脊 0 到页宽 W，y 在 ±H/2），翻页进度 p：0 平放在右边，1 翻到左边平放。
// 卷曲线 F 是一条过 (t, 0)、法线为 n = (cos a, sin a) 的直线：线之前（u ≤ 0）的纸平放不动；
// 线之后的纸沿法线方向"卷"在一根圆柱上（半径 R）：弧长 u 对应角 θ = u / R；
//   θ ≤ π：位置 = F + τ·v + n·R·sinθ，高 R(1 − cosθ)（卷起来的半圈）
//   θ > π：位置 = F + τ·v − n·(u − πR)，高 2R（翻过去、贴在卷的另一侧）
// 锥面：R 随沿线方向的坐标 v 变化（R·(1 + cone·v/H)），一头紧、一头松；斜线（a ≠ 0）让被拖的那个角领先。
// a 与 cone 都乘 sin(πp)，所以翻开（p=0）与翻到底（p=1）时都是规规矩矩的平面，翻到底是 x 的镜像。

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * 网格：cols × rows 个格，(cols+1)(rows+1) 个顶点，铺满 [0,W] × [-H/2,H/2]；返回 { base: Float32Array(xyz), uv, index }
 */
export function sheetGrid(W, H, cols, rows) {
  const n = (cols + 1) * (rows + 1);
  const base = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i;
      base[k * 3] = (i / cols) * W;
      base[k * 3 + 1] = (j / rows - 0.5) * H;
      uv[k * 2] = i / cols;
      uv[k * 2 + 1] = j / rows;
    }
  }
  const index = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  return { base, uv, index: new Uint32Array(index) };
}

/**
 * 一张纸在进度 p 时的形状。写进 out（xyz，与 base 同长）。
 *   opt.dy      被拖的角偏上还是偏下，-1..1（0 是平着卷）
 *   opt.zR/zL   这张纸平放在右边/左边的高度（叠在书页上的层次）
 *   opt.dip     订口处纸向下凹的深度
 *   opt.gutter  凹进去的范围（页宽的几分之几）
 */
export function bend(out, base, W, H, p, { dy = 0, zR = 0, zL = 0, dip = 3.5, gutter = 0.07 } = {}) {
  const s = Math.sin(Math.PI * clamp(p, 0, 1));
  const R = W * (0.0025 + 0.085 * s);
  const t = (W + (Math.PI * R) / 2) * (1 - p) - (Math.PI * R) / 2;
  const a = clamp(dy, -1, 1) * 0.32 * s;
  const cone = 0.9 * s;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const zBase = zR + (zL - zR) * smooth(0.82, 1, p); // 订口一侧卷起的那一小段，随翻过去的进度从右边那一叠的高度落到左边那一叠
  const zFlip = zR + 2 * R + (zL - zR - 2 * R) * smooth(0.82, 1, p); // 翻过去的那一部分：先高出右边的书页，快到底时落到左边那一叠上
  for (let k = 0; k < base.length; k += 3) {
    const x = base[k];
    const y = base[k + 1];
    const d = dip * Math.exp(-x / (W * gutter)); // 订口处向下凹
    const u = (x - t) * ca + y * sa;
    if (u <= 0) {
      out[k] = x;
      out[k + 1] = y;
      out[k + 2] = zR - d;
      continue;
    }
    const v = -(x - t) * sa + y * ca;
    const r = Math.max(0.6, R * (1 + (cone * v) / H));
    const th = u / r;
    let along;
    let z;
    if (th <= Math.PI) {
      along = r * Math.sin(th);
      z = zBase + r * (1 - Math.cos(th));
    } else {
      along = -(u - Math.PI * r);
      z = zFlip + (r - R) * 0.5;
    }
    out[k] = t + along * ca - v * sa;
    out[k + 1] = along * sa + v * ca;
    out[k + 2] = z - d;
  }
}

/** 弹簧：st = { p, v }，朝 target 走一步 dt 秒。到 0 或 1 的头上碰一下弹回（bounce 为反弹系数）。返回是否已停稳 */
export function spring(st, target, dt, { omega = 8, zeta = 0.7, bounce = 0.28 } = {}) {
  const n = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const acc = omega * omega * (target - st.p) - 2 * zeta * omega * st.v;
    st.v += acc * h;
    st.p += st.v * h;
    if (st.p > 1) { st.p = 1; if (st.v > 0) st.v = -st.v * bounce; }
    else if (st.p < 0) { st.p = 0; if (st.v < 0) st.v = -st.v * bounce; }
  }
  return Math.abs(st.v) < 0.015 && Math.abs(st.p - target) < 0.002;
}
