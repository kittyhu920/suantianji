// 龟甲的正面：一块带中缝的甲片，用 Canvas 画成淡墨的写意（不用位图）。
// 页面上的兆图（OmenFigure.svelte）与分享图（poster.js）共用 paintShell / paintCrackPair，
// 所以两处的甲与兆是同一份画法、同一份数据。

import { mulberry32 } from '../../core/rng.js';
import { paintCrack } from './crack.js';

export const FIG_W = 400; // 兆图的设计宽度；高度由 compact / 完整决定
export const FIG_H = { compact: 340, full: 590 };
export const BASE_Y = 290; // 钻凿在兆图里的纵向位置
export const BASE_X = { main: 326, fan: 74 }; // 正问的兆在中缝右侧，反问的在左侧（对称）
export const CRACK_K = 1.6;
export const SUTURE_X = FIG_W / 2;

function shapePath(g, w, h, rand) {
  const rx = w / 2 - 12, ry = h / 2 - 12;
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  g.beginPath();
  for (let a = 0; a <= 360; a += 3) {
    const t = a * Math.PI / 180;
    const c = Math.cos(t), s = Math.sin(t);
    // 圆角方：|x|^n + |y|^n = 1
    const n = 3.4;
    const px = Math.sign(c) * Math.abs(c) ** (2 / n);
    const py = Math.sign(s) * Math.abs(s) ** (2 / n);
    const wob = 1 + 0.012 * Math.sin(t * 3 + ph[0]) + 0.01 * Math.sin(t * 7 + ph[1]) + 0.006 * Math.sin(t * 13 + ph[2]);
    const x = w / 2 + px * rx * wob, y = h / 2 + py * ry * wob;
    a ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

/** 画一块甲片（设计宽度为 FIG_W，高度 h）。bases：钻凿处的焦痕 [{x,y,flip}] */
export function paintShell(g, h, { seed = 7, bases = [], suture = true } = {}) {
  const w = FIG_W;
  const rand = mulberry32(seed ^ 0x51ed270b);
  g.save();
  // 投影与甲底
  g.save();
  g.shadowColor = 'rgba(60,42,20,.32)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  shapePath(g, w, h, mulberry32(seed ^ 0x51ed270b));
  g.fillStyle = '#d3c19a';
  g.fill();
  g.restore();

  shapePath(g, w, h, mulberry32(seed ^ 0x51ed270b));
  g.clip();
  // 底色：骨色，低饱和
  const gr = g.createLinearGradient(0, 0, w * 0.4, h);
  gr.addColorStop(0, '#dccba4');
  gr.addColorStop(0.5, '#d2bf97');
  gr.addColorStop(1, '#c8b58b');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  // 深浅斑驳：几十团淡墨晕
  for (let i = 0; i < 46; i++) {
    const x = rand() * w, y = rand() * h, r = 20 + rand() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.6;
    rg.addColorStop(0, dark ? `rgba(95,72,40,${(0.05 + rand() * 0.07).toFixed(3)})` : `rgba(246,236,210,${(0.08 + rand() * 0.1).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // 骨面的细纹与小坑
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(80,60,36,${(rand() * 0.09).toFixed(3)})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 5, 0.8);
  }
  // 盾纹的缝：中缝纵贯，两侧各有横缝
  if (suture) {
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(40,30,18,.5)';
    g.lineWidth = 1.7;
    g.beginPath();
    for (let y = -4; y <= h + 4; y += 6) {
      const x = SUTURE_X + Math.sin(y * 0.045) * 2.6 + Math.sin(y * 0.19 + 1) * 1.1;
      y === -4 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(40,30,18,.22)';
    g.lineWidth = 1.2;
    for (const yy of [h * 0.3, h * 0.62]) {
      g.beginPath();
      for (let x = 12; x <= w - 12; x += 6) {
        const y = yy + Math.sin(x * 0.05 + yy) * 5 + (x > SUTURE_X ? (x - SUTURE_X) * 0.06 : (SUTURE_X - x) * 0.06);
        x === 12 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // 钻凿处的焦痕：一团焦褐的晕，旁边一道长条的凿
  for (const b of bases) {
    const rg = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 15);
    rg.addColorStop(0, 'rgba(48,30,16,.62)');
    rg.addColorStop(0.5, 'rgba(70,46,24,.25)');
    rg.addColorStop(1, 'rgba(70,46,24,0)');
    g.fillStyle = rg;
    g.fillRect(b.x - 16, b.y - 16, 32, 32);
    g.save();
    g.translate(b.x + (b.flip ? 9 : -9), b.y);
    g.rotate(0.12 * (b.flip ? -1 : 1));
    g.fillStyle = 'rgba(40,28,16,.4)';
    g.beginPath();
    g.ellipse(0, 0, 2.6, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // 边缘渐暗：甲片的厚度
  shapePath(g, w, h, mulberry32(seed ^ 0x51ed270b));
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(70,50,26,.16)';
  g.lineWidth = 26;
  g.stroke();
  g.strokeStyle = 'rgba(70,50,26,.22)';
  g.lineWidth = 11;
  g.stroke();
  g.restore();
  // 墨线勾边，枯笔式的断续
  g.save();
  g.strokeStyle = 'rgba(27,23,18,.62)';
  g.lineWidth = 2.1;
  g.setLineDash([180, 3, 90, 2, 240, 4]);
  shapePath(g, w, h, mulberry32(seed ^ 0x51ed270b));
  g.stroke();
  g.restore();
}

/**
 * 画一对兆：正问的在中缝右侧（兆枝朝左，朝向中缝），反问的在左侧（镜像）。裂纹到中缝为止。
 * main / fan 是 { crack, t }；其中一个可以为 null。
 */
export function paintCrackPair(g, { main, fan }, opts = {}) {
  const one = (c, flip) => {
    if (!c) return;
    g.save();
    g.beginPath();
    if (flip) g.rect(SUTURE_X + 5, 0, FIG_W, 2000); // 正问：只在中缝右边
    else g.rect(0, 0, SUTURE_X - 5, 2000);
    g.clip();
    paintCrack(g, c.crack, { x: flip ? BASE_X.main : BASE_X.fan, y: BASE_Y, k: CRACK_K, t: c.t ?? 1, flip, ...opts });
    g.restore();
  };
  one(main, true);
  one(fan, false);
}

/**
 * 刻辞的版面（设计坐标）：每一列的中心 x 与起笔 y。页面（OmenFigure.svelte）与分享图（poster.js）共用，
 * 所以两处的刻辞排在同一个位置。竖排，自右向左读：前辞、命辞（可能几列）、占辞；对贞辞在左半。
 */
export const CARVE = { pitchX: 26, pitchY: 21.5, font: 20, top: BASE_Y + 34 };
export function carveLayout(carve, withFan) {
  if (!carve) return [];
  const { pitchX, top } = CARVE;
  const out = [];
  const main = [{ t: carve.qian, k: 'qian' }, ...carve.ming.map((t) => ({ t, k: 'ming' })), ...carve.zhan.map((t) => ({ t, k: 'zhan' }))];
  main.forEach((c, i) => out.push({ ...c, x: FIG_W - 42 - pitchX / 2 - i * pitchX, y: top, n: i }));
  if (withFan && carve.fanMing) {
    const fan = [...carve.fanMing.map((t) => ({ t, k: 'ming' })), ...(carve.fanZhao ?? []).map((t) => ({ t, k: 'zhan' }))];
    const right = 42 + fan.length * pitchX;
    fan.forEach((c, i) => out.push({ ...c, x: right - pitchX / 2 - i * pitchX, y: top, n: i + 2 }));
  }
  return out;
}
