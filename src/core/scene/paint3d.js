// 灯下实物的程序化纹理（docs/DESIGN.md §5、§19）：全部在运行时用 Canvas 2D 画，不带任何位图素材。
// 每个函数返回 { color, bump?, rough? } 这样的画布（不碰 three.js），由 desk3d.js 包成贴图。
// 画一次，不在每帧重画。

import { mulberry32 } from '../rng.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 值噪声：返回 noise(x, y) ∈ [0,1)，以及分形叠加 fbm */
export function makeNoise(seed = 1) {
  const R = mulberry32(seed);
  const SZ = 256;
  const g = new Float32Array(SZ * SZ);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const at = (x, y) => g[((y & 255) << 8) | (x & 255)];
  const n2 = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return mix(mix(at(xi, yi), at(xi + 1, yi), u), mix(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  const fbm = (x, y, oct = 4) => {
    let a = 0.5;
    let s = 0;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) { s += a * n2(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
    return s / norm;
  };
  return { n2, fbm };
}

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];

/**
 * 桌面：旧漆木。四块拼板，年轮不规则（沿长边拉伸的扭曲年轮），低频的明暗磨损，几处磨亮的地方（粗糙度低），
 * 拼缝，孔隙与细纹。返回三张同尺寸的画布：色、凹凸、粗糙度（绿通道）。纤维沿横向（x）。
 */
export function paintWood({ w = 1024, h = 704, seed = 11, planks = 4, light = 0x71573a, dark = 0x3a2b1a } = {}) {
  const N = makeNoise(seed);
  const R = mulberry32(seed * 7 + 1);
  const color = canvas(w, h);
  const bump = canvas(w, h);
  const rough = canvas(w, h);
  const cg = color.getContext('2d');
  const bg = bump.getContext('2d');
  const rg = rough.getContext('2d');
  const ci = cg.createImageData(w, h);
  const bi = bg.createImageData(w, h);
  const ri = rg.createImageData(w, h);
  const L = hex(light);
  const D = hex(dark);
  const plankH = h / planks;
  const tint = Array.from({ length: planks }, () => (R() - 0.5) * 0.34);
  const shift = Array.from({ length: planks }, () => R() * 50);
  const ringK = Array.from({ length: planks }, () => 0.12 + R() * 0.07); // 每块板年轮的疏密
  for (let y = 0; y < h; y++) {
    const pi = Math.min(planks - 1, Math.floor(y / plankH));
    const yl = y - pi * plankH;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      // 年轮：沿 x 缓慢变化的扭曲，所以不是直线条
      const warp = N.fbm(x * 0.0042 + shift[pi], y * 0.011 + pi * 9.1, 4) * 2 - 1;
      const slow = N.fbm(x * 0.0016, pi * 13.7 + yl * 0.004, 2) * 2 - 1;
      const t = yl * ringK[pi] + warp * 3.4 + slow * 1.6 + pi * 3.3;
      const ring = t - Math.floor(t);
      const late = Math.pow(Math.sin(ring * Math.PI), 2.4); // 晚材：窄而深的一带
      const fib = N.n2(x * 0.05, y * 1.25 + pi * 71); // 细纹：沿 x 拉得很长
      const fib2 = N.n2(x * 0.16 + 9, y * 2.7);
      const pore = N.n2(x * 0.7, y * 2.2 + 5) > 0.9 ? 1 : 0; // 导管的小短线
      const lowW = N.fbm(x * 0.0035 + 40, y * 0.0045 + 7, 4); // 磨损：低频的明暗
      const polish = smooth(0.5, 0.78, N.fbm(x * 0.0028 + 90, y * 0.0033 + 17, 3)); // 磨亮的地方
      let v = 0.42 + 0.3 * late + (fib - 0.5) * 0.34 + (fib2 - 0.5) * 0.14 - pore * 0.16;
      v = v + tint[pi] * 0.5 + (lowW - 0.5) * 0.5 - polish * 0.12;
      v = clamp(v, 0, 1);
      // 深（晚材）→ 浅
      const k = 1 - v;
      let r = mix(L[0], D[0], k * 0.95);
      let g = mix(L[1], D[1], k * 0.95);
      let b = mix(L[2], D[2], k * 0.95);
      // 拼缝与四周的污垢
      const seam = Math.min(yl, plankH - yl);
      const sm = 1 - smooth(0.4, 2.6, seam);
      r *= 1 - sm * 0.7; g *= 1 - sm * 0.72; b *= 1 - sm * 0.74;
      // 每块板略有色差，局部发灰（落灰、手汗）
      const grime = smooth(0.6, 0.9, N.fbm(x * 0.012 + 3, y * 0.01 + 70, 3)) * 0.18;
      r = mix(r, 70, grime); g = mix(g, 58, grime); b = mix(b, 44, grime);
      ci.data[o] = r; ci.data[o + 1] = g; ci.data[o + 2] = b; ci.data[o + 3] = 255;
      const hgt = clamp(0.5 + (late - 0.5) * 0.12 + (fib - 0.5) * 0.1 - pore * 0.2 - sm * 0.6, 0, 1) * 255;
      bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = hgt; bi.data[o + 3] = 255;
      const ro = clamp(0.52 + (0.5 - lowW) * 0.5 - polish * 0.36 + grime * 0.6 + pore * 0.1, 0.18, 0.95) * 255;
      ri.data[o] = 255; ri.data[o + 1] = ro; ri.data[o + 2] = 0; ri.data[o + 3] = 255;
    }
  }
  cg.putImageData(ci, 0, 0);
  bg.putImageData(bi, 0, 0);
  rg.putImageData(ri, 0, 0);
  // 几道浅划痕与一两圈茶杯的水渍
  cg.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const x0 = R() * w;
    const y0 = R() * h;
    const len = 20 + R() * 120;
    const a = (R() - 0.5) * 0.5;
    cg.strokeStyle = `rgba(${R() < 0.5 ? '230,200,150' : '20,12,6'},${(0.04 + R() * 0.08).toFixed(3)})`;
    cg.lineWidth = 0.6 + R() * 0.8;
    cg.beginPath();
    cg.moveTo(x0, y0);
    cg.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    cg.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const x0 = w * (0.15 + R() * 0.7);
    const y0 = h * (0.2 + R() * 0.6);
    const rr = 22 + R() * 10;
    cg.strokeStyle = 'rgba(20,12,6,.14)';
    cg.lineWidth = 3;
    cg.beginPath();
    cg.ellipse(x0, y0, rr, rr * 0.96, 0, 0.3, TAU - 0.5);
    cg.stroke();
  }
  return { color, bump, rough };
}

/** 书的封面（俯视画面：横的，书脊在上沿）：深靛布面、织纹、四眼订线、题签、四角的残印位。返回 { color, bump }。
    画布的方向已按"书脊朝里的横放"转好：参数 w、h 是屏幕上看到的宽与高（px）。 */
export function paintCover({ w = 1440, h = 1040, seed = 3, cloth = '#2f3b50', cb = 0x232c40 } = {}) {
  const R = mulberry32(seed);
  const color = canvas(h, w); // 实际画布是竖的（u 沿书的宽，v 沿书的高），按旋转后的坐标画
  const bump = canvas(h, w);
  const make = (cv, fn) => {
    const g = cv.getContext('2d');
    g.setTransform(0, -1, 1, 0, 0, w); // 屏幕坐标 (sx, sy) → 画布 (sy, w - sx)
    fn(g);
  };
  make(color, (g) => {
    g.fillStyle = cloth;
    g.fillRect(0, 0, w, h);
    // 织纹：经纬细线
    g.globalAlpha = 0.5;
    for (let x = 0; x < w; x += 3) { g.fillStyle = (x / 3) % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)'; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = (y / 3) % 2 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.08)'; g.fillRect(0, y, w, 1); }
    g.globalAlpha = 1;
    // 布纹的粗细不匀：几十根偏粗、偏浅或偏深的纱（旧布不是一色的）
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(R() * w), y = Math.floor(R() * h), len = 40 + R() * 260;
      g.fillStyle = R() < 0.5 ? `rgba(190,196,208,${(0.05 + R() * 0.07).toFixed(3)})` : `rgba(10,12,20,${(0.06 + R() * 0.08).toFixed(3)})`;
      if (R() < 0.5) g.fillRect(x, y, len, 1 + Math.floor(R() * 2)); else g.fillRect(x, y, 1 + Math.floor(R() * 2), len);
    }
    // 磨损：边角发白、手摸的地方色浅，几团深浅
    for (let i = 0; i < 40; i++) {
      const x = R() * w, y = R() * h, r = 60 + R() * 200;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      const lite = R() < 0.5;
      rg.addColorStop(0, lite ? `rgba(200,210,235,${(0.015 + R() * 0.025).toFixed(3)})` : `rgba(0,0,10,${(0.03 + R() * 0.04).toFixed(3)})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 边与角磨得发灰发白（布面磨掉了一层颜色）
    for (let i = 0; i < 900; i++) {
      const side = Math.floor(R() * 4);
      const t = R();
      const d = Math.pow(R(), 3) * 26;
      const x = side === 0 ? d : side === 1 ? w - d : t * w;
      const y = side === 2 ? d : side === 3 ? h - d : t * h;
      g.fillStyle = `rgba(206,208,214,${(0.04 + R() * 0.09).toFixed(3)})`;
      g.fillRect(x, y, 2 + R() * 7, 1 + R() * 3);
    }
    for (const [cx, cy] of [[0, h], [w, h], [w, 0]]) { // 四角：手摸得最多
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 120);
      rg.addColorStop(0, 'rgba(210,212,218,.2)'); rg.addColorStop(1, 'rgba(210,212,218,0)');
      g.fillStyle = rg;
      g.fillRect(cx - 120, cy - 120, 240, 240);
    }
    const eg = g.createLinearGradient(0, 0, 0, h);
    eg.addColorStop(0, 'rgba(0,0,0,.45)'); eg.addColorStop(0.07, 'rgba(0,0,0,.08)'); eg.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = eg;
    g.fillRect(0, 0, w, h); // 书脊处向里凹下去、下沿略暗
    // 四眼订线：书脊（上沿）下约 0.9cm 一排四孔，丝线沿书脊一圈圈压过
    const px = w / 36;
    const holeY = 3.1 * px;
    const xs = [4.2, 12.4, 20.6, 29.3].map((c) => c * px);
    g.strokeStyle = 'rgba(8,6,3,.5)';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(xs[0], holeY); g.lineTo(xs[3], holeY); g.stroke();
    g.strokeStyle = '#e9e0c8';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(xs[0], holeY); g.lineTo(xs[3], holeY); g.stroke();
    for (const x of xs) {
      g.strokeStyle = 'rgba(8,6,3,.5)'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(x + 2, 0); g.lineTo(x + 2, holeY + 2); g.stroke();
      g.strokeStyle = '#e9e0c8'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, holeY); g.stroke();
      g.fillStyle = '#0e0a05';
      g.beginPath(); g.arc(x, holeY, 7, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(233,224,200,.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(x, holeY, 9, 0, TAU); g.stroke();
    }
    // 题签：书名，横写在书脊下的一张窄纸上（横排，自左向右）
    const lw = 11.5 * px, lh = 3.5 * px, lx = (36 - 11.5) / 2 * px + 0.6 * px, ly = 7.2 * px;
    g.save();
    g.translate(lx, ly);
    g.rotate(-0.006);
    g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
    const lg = g.createLinearGradient(0, 0, lw, 0);
    lg.addColorStop(0, '#e0d2ae'); lg.addColorStop(0.5, '#eee3c6'); lg.addColorStop(1, '#dfd0ab');
    g.fillStyle = lg;
    g.fillRect(0, 0, lw, lh);
    g.shadowColor = 'transparent';
    g.strokeStyle = 'rgba(60,40,14,.4)'; g.lineWidth = 3;
    g.strokeRect(10, 10, lw - 20, lh - 20);
    g.fillStyle = '#1b1712';
    g.font = `${Math.round(lh * 0.56)}px "Huiwen-mincho","Noto Serif SC",serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const t = '演算天机';
    const step = lw / (t.length + 0.6);
    [...t].forEach((c, i) => g.fillText(c, step * (i + 0.8), lh * 0.54));
    g.restore();
    // 四角的残印位：极淡的印痕
    g.strokeStyle = 'rgba(236,228,208,.16)';
    g.lineWidth = 3;
    g.setLineDash([22, 7, 12, 9, 17, 7]);
    [[2.4, 11.5], [32.4, 11.5], [2.4, 22], [32.4, 22]].forEach(([cx, cy]) => g.strokeRect(cx * px, cy * px, 2.6 * px, 2.6 * px));
    g.setLineDash([]);
  });
  make(bump, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = (x / 3) % 2 ? '#8c8c8c' : '#747474'; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 3) { g.fillStyle = (y / 3) % 2 ? '#888' : '#767676'; g.fillRect(0, y, w, 1); }
  });
  void cb;
  return { color, bump };
}

/** 纸：宣纸的底色与纤维。edgeLight 为真时四边略深 */
export function paintPaper({ w = 512, h = 512, seed = 5, base = [239, 230, 208], fiber = 0.5, gutter = 0 } = {}) {
  const N = makeNoise(seed);
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  const im = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const f = N.n2(x * 0.5, y * 0.03) * 0.55 + N.n2(x * 0.03, y * 0.4) * 0.45; // 纤维：纵横两个方向的细丝
      const m = N.fbm(x * 0.012, y * 0.012, 4);
      let k = 1 + (f - 0.5) * 0.09 * fiber * 2 + (m - 0.5) * 0.1;
      if (gutter) k *= 1 - gutter * Math.pow(1 - x / w, 3);
      im.data[o] = base[0] * k; im.data[o + 1] = base[1] * k; im.data[o + 2] = base[2] * k * (0.985 + m * 0.03); im.data[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  return cv;
}

/** 书页层层叠叠的边：横条的细纹 */
export function paintEdge({ w = 8, h = 96 } = {}) {
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    g.fillStyle = y % 4 < 2 ? '#dccfa9' : '#bfae86';
    g.fillRect(0, y, w, 1);
  }
  return cv;
}

/** 竹筒：包浆的竹子。u 绕一圈（0.5 在正面），v 自下而上。返回 { color, bump, rough } */
export function paintBamboo({ w = 512, h = 1024, seed = 21 } = {}) {
  const N = makeNoise(seed);
  const R = mulberry32(seed);
  const color = canvas(w, h);
  const bump = canvas(w, h);
  const rough = canvas(w, h);
  const cg = color.getContext('2d');
  const bg = bump.getContext('2d');
  const rg = rough.getContext('2d');
  const ci = cg.createImageData(w, h);
  const bi = bg.createImageData(w, h);
  const ri = rg.createImageData(w, h);
  const nodes = [0.0, 0.34, 0.68]; // 竹节（v，自下）
  for (let y = 0; y < h; y++) {
    const v = 1 - y / h;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const u = x / w;
      const fib = N.n2(u * 90, v * 4); // 竖向的纤维
      const fib2 = N.n2(u * 260, v * 9);
      const mott = N.fbm(u * 6, v * 3 + 5, 4);
      let nd = 1;
      for (const nv of nodes) nd = Math.min(nd, Math.abs(v - nv));
      const band = 1 - smooth(0.0, 0.028, nd); // 节上一圈凸起
      const hand = Math.exp(-((u - 0.5) ** 2) / 0.03) * smooth(0.18, 0.5, v) * (1 - smooth(0.62, 0.9, v)); // 手握的地方：包浆，色深而亮
      let t = 0.5 + (fib - 0.5) * 0.35 + (fib2 - 0.5) * 0.12 + (mott - 0.5) * 0.7 - hand * 0.2 - band * 0.18;
      t = clamp(t, 0, 1);
      // 竹黄：浅蜜 → 深褐
      let r = mix(196, 108, 1 - t);
      let g = mix(152, 74, 1 - t);
      let b = mix(86, 36, 1 - t);
      const top = smooth(0.9, 0.98, v); // 近口沿略深（手汗与油）
      r *= 1 - top * 0.25; g *= 1 - top * 0.28; b *= 1 - top * 0.3;
      ci.data[o] = r; ci.data[o + 1] = g; ci.data[o + 2] = b; ci.data[o + 3] = 255;
      const hh = clamp(0.5 + band * 0.4 + (fib - 0.5) * 0.12, 0, 1) * 255;
      bi.data[o] = bi.data[o + 1] = bi.data[o + 2] = hh; bi.data[o + 3] = 255;
      const ro = clamp(0.62 - hand * 0.36 - (mott - 0.5) * 0.2 + (1 - band) * 0.0, 0.2, 0.9) * 255;
      ri.data[o] = 255; ri.data[o + 1] = ro; ri.data[o + 2] = 0; ri.data[o + 3] = 255;
    }
  }
  cg.putImageData(ci, 0, 0);
  bg.putImageData(bi, 0, 0);
  rg.putImageData(ri, 0, 0);
  // 正面：一方朱印（天机）与竖写的"签"字；朱只给印章
  const sx = w * 0.5;
  const sy = h * (1 - 0.54);
  cg.save();
  cg.translate(sx, sy);
  cg.rotate(-0.05);
  cg.fillStyle = '#b3261f';
  const s = 74;
  cg.fillRect(-s / 2, -s / 2, s, s);
  cg.fillStyle = 'rgba(239,230,208,.9)';
  cg.font = '30px "Huiwen-mincho","Noto Serif SC",serif';
  cg.textAlign = 'center';
  cg.textBaseline = 'middle';
  cg.fillText('天', 0, -s * 0.2);
  cg.fillText('机', 0, s * 0.22);
  for (let i = 0; i < 90; i++) { // 印面剥蚀
    cg.fillStyle = `rgba(190,150,90,${(0.2 + R() * 0.5).toFixed(2)})`;
    cg.fillRect((R() - 0.5) * s, (R() - 0.5) * s, 1 + R() * 2.5, 1 + R() * 2);
  }
  cg.restore();
  cg.fillStyle = 'rgba(30,18,8,.82)';
  cg.font = '64px "Huiwen-mincho","Noto Serif SC",serif';
  cg.textAlign = 'center';
  cg.textBaseline = 'middle';
  cg.fillText('签', sx, h * (1 - 0.74));
  return { color, bump, rough };
}

/** 铜钱正反两面（一张 2×1 的画布，左半是字面，右半是背面）与对应的凹凸图。旧铜：锈色、磨亮的边。 */
export function paintCoin({ size = 384, seed = 31 } = {}) {
  const R = mulberry32(seed);
  const N = makeNoise(seed);
  const color = canvas(size * 2, size);
  const bump = canvas(size * 2, size);
  const cg = color.getContext('2d');
  const bg = bump.getContext('2d');
  const face = (g, bgm, ox, back) => {
    const c = size / 2;
    const rad = size / 2 - 2;
    // 色
    const rgd = g.createRadialGradient(ox + c * 0.85, c * 0.8, 10, ox + c, c, rad);
    rgd.addColorStop(0, '#b98a47'); rgd.addColorStop(0.55, '#8d6431'); rgd.addColorStop(1, '#5d4121');
    g.fillStyle = rgd;
    g.fillRect(ox, 0, size, size);
    // 锈：青绿的铜绿，集中在字的凹处与近边的地方；赭红的氧化斑
    for (let i = 0; i < 110; i++) {
      const a = R() * TAU;
      const rr = rad * (0.25 + R() * 0.72);
      const x = ox + c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      const r = 6 + R() * 26;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const green = R() < 0.6;
      gr.addColorStop(0, green ? `rgba(78,128,98,${(0.1 + R() * 0.3).toFixed(2)})` : `rgba(110,52,30,${(0.1 + R() * 0.25).toFixed(2)})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 磨亮的边：外廓一圈金亮
    g.lineWidth = size * 0.035;
    const rim = g.createLinearGradient(ox, 0, ox + size, size);
    rim.addColorStop(0, '#e8c47a'); rim.addColorStop(0.5, '#a97c3b'); rim.addColorStop(1, '#d7ae62');
    g.strokeStyle = rim;
    g.beginPath(); g.arc(ox + c, c, rad - size * 0.02, 0, TAU); g.stroke();
    // 内郭：方孔外一圈方框
    const hole = size * 0.115;
    g.strokeStyle = 'rgba(232,196,122,.8)';
    g.lineWidth = size * 0.02;
    g.strokeRect(ox + c - hole * 1.5, c - hole * 1.5, hole * 3, hole * 3);
    // 字或星月
    g.fillStyle = 'rgba(40,26,12,.78)';
    g.font = `${Math.round(size * 0.2)}px "Huiwen-mincho","Noto Serif SC",serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (!back) {
      [['天', 0, -0.285], ['机', 0, 0.285], ['通', 0.285, 0], ['宝', -0.285, 0]].forEach(([ch, dx, dy]) => {
        g.fillStyle = 'rgba(255,225,160,.35)'; g.fillText(ch, ox + c + dx * size + 1.5, c + dy * size + 2);
        g.fillStyle = 'rgba(40,26,12,.85)'; g.fillText(ch, ox + c + dx * size, c + dy * size);
      });
    } else {
      g.fillStyle = 'rgba(40,26,12,.85)';
      g.beginPath(); g.arc(ox + c, c - size * 0.3, size * 0.03, 0, TAU); g.fill();
      g.beginPath(); g.arc(ox + c + size * 0.28, c + size * 0.22, size * 0.07, 0.9 * Math.PI, 1.9 * Math.PI); g.stroke();
    }
    // 细划痕
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(255,230,170,${(0.05 + R() * 0.1).toFixed(2)})`;
      g.lineWidth = 1;
      const a = R() * TAU;
      const r1 = rad * R();
      g.beginPath(); g.moveTo(ox + c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.lineTo(ox + c + Math.cos(a + 0.4) * (r1 + 30), c + Math.sin(a + 0.4) * (r1 + 30)); g.stroke();
    }
    // 凹凸：廓、内郭、字
    bgm.fillStyle = '#6a6a6a';
    bgm.fillRect(ox, 0, size, size);
    bgm.strokeStyle = '#fff';
    bgm.lineWidth = size * 0.05;
    bgm.beginPath(); bgm.arc(ox + c, c, rad - size * 0.03, 0, TAU); bgm.stroke();
    bgm.lineWidth = size * 0.03;
    bgm.strokeRect(ox + c - hole * 1.5, c - hole * 1.5, hole * 3, hole * 3);
    bgm.fillStyle = '#fff';
    bgm.font = g.font;
    bgm.textAlign = 'center';
    bgm.textBaseline = 'middle';
    if (!back) [['天', 0, -0.285], ['机', 0, 0.285], ['通', 0.285, 0], ['宝', -0.285, 0]].forEach(([ch, dx, dy]) => bgm.fillText(ch, ox + c + dx * size, c + dy * size));
    // 微噪
    for (let i = 0; i < 1800; i++) { bgm.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '0,0,0'},.12)`; bgm.fillRect(ox + R() * size, R() * size, 1.5, 1.5); }
  };
  face(cg, bg, 0, false);
  face(cg, bg, size, true);
  void N;
  return { color, bump };
}

/** 龟壳（背甲）：六边的盾片，黑褐的缝，琥珀的斑。u 绕一圈，v 自壳口到壳顶 */
export function paintShellBack({ w = 1024, h = 512, seed = 41 } = {}) {
  const R = mulberry32(seed);
  const N = makeNoise(seed);
  const color = canvas(w, h);
  const bump = canvas(w, h);
  const g = color.getContext('2d');
  const b = bump.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#a98a52'); base.addColorStop(0.06, '#8a6330'); base.addColorStop(1, '#4a3118');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, w, h);
  // 琥珀与深褐的斑驳
  for (let i = 0; i < 160; i++) {
    const x = R() * w, y = R() * h, r = 20 + R() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, R() < 0.5 ? `rgba(190,130,50,${(0.12 + R() * 0.2).toFixed(2)})` : `rgba(22,12,6,${(0.1 + R() * 0.25).toFixed(2)})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 盾片：六边形密铺（球面展开，越近壳顶越小）
  g.lineJoin = 'round';
  const HX = 74;
  const HY = 64;
  for (let row = -1; row < h / (HY * 1.5) + 1; row++) {
    for (let col = -1; col < w / (HX * 2) + 1; col++) {
      const cx = col * HX * 2 + (row % 2 ? HX : 0) + (R() - 0.5) * 3;
      const cy = row * HY * 1.5 + 70;
      const pts = [[0, -HY], [HX, -HY / 2], [HX, HY / 2], [0, HY], [-HX, HY / 2], [-HX, -HY / 2]];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * 0.97, cy + y * 0.97) : g.moveTo(cx + x * 0.97, cy + y * 0.97)));
      g.closePath();
      g.fillStyle = `rgba(${R() < 0.5 ? '20,10,4' : '170,115,45'},${(0.05 + R() * 0.12).toFixed(2)})`;
      g.fill();
      g.strokeStyle = 'rgba(18,9,3,.78)';
      g.lineWidth = 6;
      g.stroke();
      b.beginPath();
      pts.forEach(([x, y], i) => (i ? b.lineTo(cx + x * 0.97, cy + y * 0.97) : b.moveTo(cx + x * 0.97, cy + y * 0.97)));
      b.closePath();
      b.strokeStyle = '#303030';
      b.lineWidth = 8;
      b.stroke();
      // 盾片上的年轮
      g.strokeStyle = 'rgba(18,9,3,.22)';
      g.lineWidth = 2;
      for (let k = 1; k < 4; k++) {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * 0.97 * (1 - k * 0.22), cy + y * 0.97 * (1 - k * 0.22)) : g.moveTo(cx + x * 0.97 * (1 - k * 0.22), cy + y * 0.97 * (1 - k * 0.22))));
        g.closePath();
        g.stroke();
      }
    }
  }
  // 包浆：壳口一圈磨得发亮
  const rim = g.createLinearGradient(0, 0, 0, h * 0.14);
  rim.addColorStop(0, 'rgba(240,215,150,.3)'); rim.addColorStop(1, 'rgba(240,215,150,0)');
  g.fillStyle = rim;
  g.fillRect(0, 0, w, h * 0.14);
  void N;
  return { color, bump };
}

/** 龟腹甲的背面：骨色、深浅斑驳、六处钻凿（圆孔一个、长槽一道）与序号；used 里是已灼过的处（焦痕）。坐标 300 × 420。 */
export function paintPlastronBack(cv, { spots, used = [], seed = 51, cn }) {
  const W = cv.width;
  const k = W / 300;
  const g = cv.getContext('2d');
  const R = mulberry32(seed);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, 300, 420);
  const bone = g.createLinearGradient(0, 0, 180, 420);
  bone.addColorStop(0, '#cdbb94'); bone.addColorStop(0.6, '#c2af87'); bone.addColorStop(1, '#b6a177');
  g.fillStyle = bone;
  g.fillRect(0, 0, 300, 420);
  for (let i = 0; i < 70; i++) {
    const x = R() * 300, y = R() * 420, r = 10 + R() * 48;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, R() < 0.6 ? `rgba(100,76,40,${(0.04 + R() * 0.08).toFixed(3)})` : `rgba(246,236,210,${(0.06 + R() * 0.1).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(80,60,36,${(R() * 0.08).toFixed(3)})`; g.fillRect(R() * 300, R() * 420, 1 + R() * 4, 0.6); }
  // 盾纹缝：中缝与两侧横缝
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(30,22,12,.5)';
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(150, 14); g.bezierCurveTo(153, 90, 147, 160, 151, 214); g.bezierCurveTo(154, 280, 148, 350, 150, 408); g.stroke();
  g.strokeStyle = 'rgba(30,22,12,.26)';
  g.lineWidth = 1.1;
  [['M44 160 C80 154 118 158 148 164'], ['M256 160 C220 154 182 158 152 164'], ['M52 262 C86 268 120 266 148 272'], ['M248 262 C214 268 180 266 152 272']].forEach(([d]) => g.stroke(new Path2D(d)));
  // 钻凿
  spots.forEach((s, i) => {
    const left = s.x < 150;
    g.save();
    g.translate(s.x, s.y);
    if (used[i]) {
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 17);
      rg.addColorStop(0, 'rgba(36,20,10,.75)'); rg.addColorStop(0.55, 'rgba(60,36,18,.36)'); rg.addColorStop(1, 'rgba(60,36,18,0)');
      g.fillStyle = rg;
      g.fillRect(-18, -18, 36, 36);
    }
    g.fillStyle = 'rgba(40,28,16,.7)';
    g.beginPath(); g.ellipse(left ? 11 : -11, 0, 3.6, 9, left ? -0.14 : 0.14, 0, TAU); g.fill();
    g.fillStyle = 'rgba(30,20,12,.88)';
    g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(15,10,6,.7)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.stroke();
    if (!used[i]) {
      g.fillStyle = 'rgba(27,23,18,.5)';
      g.font = '11px "Noto Serif SC",serif';
      g.textAlign = 'center';
      g.fillText(cn(i + 1), 0, 27);
    }
    g.restore();
  });
  // 边缘渐暗
  g.strokeStyle = 'rgba(70,50,26,.18)';
  g.lineWidth = 20;
  g.stroke(new Path2D('M150 14 C205 14 252 40 262 96 C270 140 258 176 266 214 C274 260 262 318 244 356 C226 394 188 408 150 408 C112 408 74 394 56 356 C38 318 26 260 34 214 C42 176 30 140 38 96 C48 40 95 14 150 14 Z'));
}

/** 星盘的盘面：铜色底、同心圈、周天刻度（细线）、二十八宿的分隔、中央的星点。 */
export function paintAstrolabe({ size = 1024, seed = 61 } = {}) {
  const R = mulberry32(seed);
  const color = canvas(size, size);
  const bump = canvas(size, size);
  const g = color.getContext('2d');
  const b = bump.getContext('2d');
  const c = size / 2;
  const gr = g.createRadialGradient(c * 0.8, c * 0.75, 30, c, c, c);
  gr.addColorStop(0, '#c49a55'); gr.addColorStop(0.7, '#9a7239'); gr.addColorStop(1, '#6e4f26');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#707070';
  b.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = R() * size, y = R() * size, r = 20 + R() * 60;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, R() < 0.5 ? 'rgba(70,110,90,.12)' : 'rgba(255,225,160,.08)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const ring = (r, w, a = 0.8) => {
    for (const [ctx, col] of [[g, `rgba(30,18,6,${a})`], [b, '#222']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.arc(c, c, r, 0, TAU); ctx.stroke();
    }
  };
  ring(c * 0.97, 5); ring(c * 0.9, 2.5); ring(c * 0.78, 2.5); ring(c * 0.55, 2); ring(c * 0.3, 2);
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * TAU;
    const long = i % 10 === 0 ? 0.045 : i % 5 === 0 ? 0.03 : 0.016;
    for (const [ctx, col, lw] of [[g, 'rgba(30,18,6,.85)', i % 10 === 0 ? 2.2 : 1.1], [b, '#202020', 1.6]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
      ctx.lineTo(c + Math.cos(a) * c * (0.9 - long), c + Math.sin(a) * c * (0.9 - long));
      ctx.stroke();
    }
  }
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    g.strokeStyle = 'rgba(30,18,6,.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.55, c + Math.sin(a) * c * 0.55); g.lineTo(c + Math.cos(a) * c * 0.78, c + Math.sin(a) * c * 0.78); g.stroke();
  }
  // 星点与连线
  const pts = Array.from({ length: 11 }, () => { const a = R() * TAU; const r = c * (0.1 + R() * 0.42); return [c + Math.cos(a) * r, c + Math.sin(a) * r]; });
  g.strokeStyle = 'rgba(30,18,6,.5)'; g.lineWidth = 1.2;
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  pts.forEach(([x, y]) => { g.fillStyle = 'rgba(30,18,6,.9)'; g.beginPath(); g.arc(x, y, 4 + R() * 3, 0, TAU); g.fill(); });
  return { color, bump };
}

/** 一块小木签：左边一个大字（卷名），右边小字（全称或"未开卷"）。木色浅、字深。 */
export function paintTag({ name, title, closed = false, w = 420, h = 130 }) {
  const cv = canvas(w, h);
  const g = cv.getContext('2d');
  const R = mulberry32(name.charCodeAt(0));
  const gr = g.createLinearGradient(0, 0, w, 0);
  if (closed) { gr.addColorStop(0, '#6d6657'); gr.addColorStop(0.5, '#7a7363'); gr.addColorStop(1, '#656050'); } else { gr.addColorStop(0, '#d8c497'); gr.addColorStop(0.5, '#e4d2a6'); gr.addColorStop(1, '#cdb988'); }
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 5 + R() * 4) { g.fillStyle = closed ? 'rgba(20,16,10,.12)' : 'rgba(92,64,30,.16)'; g.fillRect(0, y, w, 1.2); }
  g.fillStyle = closed ? 'rgba(235,228,210,.82)' : '#2a2118';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.font = `${Math.round(h * 0.68)}px "Huiwen-mincho","Noto Serif SC",serif`;
  g.fillText(name, h * 0.62, h * 0.54);
  g.strokeStyle = closed ? 'rgba(235,228,210,.3)' : 'rgba(42,33,24,.4)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(h * 1.12, h * 0.2); g.lineTo(h * 1.12, h * 0.8); g.stroke();
  g.textAlign = 'left';
  g.font = `${Math.round(h * 0.34)}px "Huiwen-mincho","Noto Serif SC",serif`;
  g.fillText(title, h * 1.28, closed ? h * 0.36 : h * 0.5);
  if (closed) {
    g.font = `${Math.round(h * 0.23)}px "Noto Serif SC",serif`;
    g.fillStyle = 'rgba(235,228,210,.74)';
    g.fillText('未开卷', h * 1.28, h * 0.7);
  }
  return cv;
}

/** 软接触影：中间黑、向外淡出 */
export function paintBlob({ size = 128 } = {}) {
  const cv = canvas(size, size);
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.45, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return cv;
}

/** 烟与火星用的软圆点 */
export function paintPuff({ size = 64 } = {}) {
  const cv = canvas(size, size);
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return cv;
}

/** 砚与笺上的简单纹理：深石，带细纹 */
export function paintSlate({ size = 256, seed = 71 } = {}) {
  const N = makeNoise(seed);
  const cv = canvas(size, size);
  const g = cv.getContext('2d');
  const im = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    const v = 0.5 + (N.fbm(x * 0.03, y * 0.03, 4) - 0.5) * 0.9 + (N.n2(x * 0.5, y * 0.1) - 0.5) * 0.1;
    const c = 22 + v * 26;
    im.data[o] = c; im.data[o + 1] = c + 1; im.data[o + 2] = c + 3; im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return cv;
}

/** 历书的封面：素纸，一道黑色的签条，一枚小印 */
export function paintAlmanac({ w = 384, h = 512 } = {}) {
  const cv = paintPaper({ w, h, seed: 83, base: [222, 211, 186] });
  const g = cv.getContext('2d');
  g.fillStyle = '#22201c';
  g.fillRect(w * 0.16, h * 0.1, w * 0.68, h * 0.12);
  g.fillStyle = '#e6dcc0';
  g.font = `${Math.round(h * 0.085)}px "Huiwen-mincho","Noto Serif SC",serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('黄历', w * 0.5, h * 0.16);
  g.strokeStyle = 'rgba(27,23,18,.5)';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(w * 0.18, h * (0.34 + i * 0.075)); g.lineTo(w * 0.82, h * (0.34 + i * 0.075)); g.stroke(); }
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(w * (0.18 + i * 0.1), h * 0.34); g.lineTo(w * (0.18 + i * 0.1), h * 0.715); g.stroke(); }
  return cv;
}
