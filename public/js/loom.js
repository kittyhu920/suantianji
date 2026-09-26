// 数纬：把每一次掷筊织成一幅锦
// 每掷一次是一束丝，自下而上按先后排列。左半是你来时，右半是筊的回答：
// 圣杯的丝平直穿过；笑杯的丝在右半绞成一个结，又回到原位；
// 阴杯的丝过了中缝向上下分开，并由泥金转为朱砂。
// 被你"不服，再掷"弃掉的那一掷也织进去，只是淡一些——重掷越多，锦越乱。
// 所有丝线都连续穿过中缝，织它的始终是同一个人。

import { mulberry32 } from './rng.js';

const GOLD = [197, 160, 89];
const CINNABAR = [196, 64, 60];
const INK = [242, 230, 204];

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

export function weave(canvas, { seed, throws, reduced = false }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(canvas.clientWidth * dpr);
  const H = Math.round(W * 0.75);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const rand = mulberry32(seed);

  // 绀纸底 + 经线
  g.fillStyle = '#171C24';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(197,160,89,0.035)';
  g.lineWidth = 1;
  const warp = 5 * dpr;
  for (let x = warp / 2; x < W; x += warp) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, H);
    g.stroke();
  }

  // 至少按三束排布，掷得少时居中
  const slots = Math.max(3, throws.length);
  const bandH = (H * 0.84) / slots;
  const thick = bandH * 0.64;
  const top = H * 0.08 + ((slots - throws.length) * bandH) / 2;
  const center = (b) => top + throws.length * bandH - (b + 0.5) * bandH;

  const perBand = Math.round((58 + rand() * 14) * Math.min(1, 6 / slots + 0.3));
  const threads = [];
  for (let b = 0; b < throws.length; b++) {
    const { kind, kept } = throws[b];
    for (let i = 0; i < perBand; i++) {
      const stray = rand() < 0.025;
      const o = rand() * 2 - 1;
      threads.push({
        b, o, stray, kind,
        k1: 1 + rand() * 3, p1: rand() * Math.PI * 2,
        k2: 5 + rand() * 6, p2: rand() * Math.PI * 2,
        ks: 0.5 + rand() * 1.5, ps: rand() * Math.PI * 2,
        a: (stray ? 0.16 : 0.1 + rand() * 0.18) * (kept ? 1 : 0.4),
        w: (stray ? 0.9 : 0.5 + rand() * 0.7) * dpr,
        x: -8, y: center(b) + o * thick / 2,
      });
    }
  }

  const target = (th, x) => {
    let off = th.o * thick / 2;
    if (th.kind === 'yin') {
      const f = smoothstep(W * 0.5, W * 0.62, x);
      const parted = Math.sign(th.o || 1) * (thick * 0.52 + Math.abs(th.o) * thick * 0.14);
      off = lerp(off, parted, f);
    } else if (th.kind === 'xiao') {
      const t = Math.min(1, Math.max(0, (x - W * 0.52) / (W * 0.3)));
      off *= Math.cos(t * Math.PI * 2); // 绞成一个结，再回到原位
    }
    const u = (x / W) * Math.PI * 2;
    const wob = Math.sin(u * th.k1 + th.p1) * thick * 0.05 + Math.sin(u * th.k2 + th.p2) * thick * 0.015;
    const drift = th.stray ? Math.sin(u * th.ks + th.ps) * bandH * 1.1 : 0;
    return center(th.b) + off + wob + drift;
  };

  const colorAt = (th, x) => {
    if (th.stray) return INK;
    if (th.kind !== 'yin') return GOLD;
    const t = smoothstep(W * 0.44, W * 0.56, x);
    return [0, 1, 2].map((i) => Math.round(lerp(GOLD[i], CINNABAR[i], t)));
  };

  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const step = W / 420;

  const advance = () => {
    for (const th of threads) {
      const nx = th.x + step;
      const ny = lerp(th.y, target(th, nx), 0.22);
      const c = colorAt(th, nx);
      g.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${th.a})`;
      g.lineWidth = th.w;
      g.beginPath();
      g.moveTo(th.x, th.y);
      g.lineTo(nx, ny);
      g.stroke();
      th.x = nx;
      th.y = ny;
    }
  };

  // 先让丝线在画外就位，免得起笔处有收束痕迹
  for (const th of threads) th.y = target(th, th.x);

  return new Promise((resolve) => {
    if (reduced) {
      while (threads.length && threads[0].x < W + 8) advance();
      g.globalCompositeOperation = 'source-over';
      resolve();
      return;
    }
    const frame = () => {
      for (let k = 0; k < 3; k++) advance();
      if (threads.length && threads[0].x < W + 8) requestAnimationFrame(frame);
      else {
        g.globalCompositeOperation = 'source-over';
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}
