// 龟甲的正面：与背面（Plastron.svelte）是同一块甲、同一个轮廓，翻面时左右镜像。用 Canvas 画成淡墨的写意（不用位图）。
// 页面上的兆图（OmenFigure.svelte）与分享图（poster.js）共用 paintShell / paintCracks / carveLayout，
// 所以两处的甲、兆与刻辞是同一份画法、同一份数据。
//
// 坐标：兆图的设计宽度 400、高 560（与背面 300 × 420 同比例，放大 4/3）。
// 兆落在对应钻凿的位置：背面在左边的钻凿，翻过来在右边（x 取镜像），所以 spotPos 把 x 翻过来。

import { mulberry32 } from '../../core/rng.js';
import { paintCrack } from './crack.js';
import { SPOTS } from './data.js';

export const FIG_W = 400;
export const FIG_H = 560;
export const SUTURE_X = FIG_W / 2;
export const CRACK_K = 1.25;
const S = FIG_W / 300; // 背面坐标 → 兆图坐标

// 龟腹甲的轮廓（背面坐标 300 × 420），与 Plastron.svelte 里的是同一条
export const PLASTRON_D = 'M150 14 C205 14 252 40 262 96 C270 140 258 176 266 214 C274 260 262 318 244 356 C226 394 188 408 150 408 C112 408 74 394 56 356 C38 318 26 260 34 214 C42 176 30 140 38 96 C48 40 95 14 150 14 Z';
let outline = null;
const P = () => (outline ??= new Path2D(PLASTRON_D));

/** 第 i 处钻凿在正面的位置：x 取镜像；兆枝朝向中缝（右半的朝左，flip 为真） */
export function spotPos(i) {
  const s = SPOTS[i];
  const x = (300 - s.x) * S;
  return { x, y: s.y * S, flip: x > SUTURE_X };
}

// 在背面坐标系下做一件事（填充 / 裁剪 / 描边），线宽随之放大
function inShape(g, fn) {
  g.save();
  g.scale(S, S);
  fn(P());
  g.restore();
}

/** 画一块甲片。bases：钻凿处的焦痕 [{x,y,flip}] */
export function paintShell(g, { seed = 7, bases = [] } = {}) {
  const w = FIG_W;
  const h = FIG_H;
  const rand = mulberry32(seed ^ 0x51ed270b);
  g.save();
  // 投影与甲底
  g.save();
  g.shadowColor = 'rgba(60,42,20,.32)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  g.fillStyle = '#d3c19a';
  inShape(g, (p) => g.fill(p));
  g.restore();

  g.scale(S, S); // 裁剪要留到外层的 restore：先在背面坐标里裁，再把坐标换回来
  g.clip(P());
  g.scale(1 / S, 1 / S);
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
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(80,60,36,${(rand() * 0.09).toFixed(3)})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 5, 0.8);
  }
  // 盾纹的缝：中缝纵贯，两侧各有横缝（位置与背面一致）
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
  for (const yy of [215, 355]) {
    g.beginPath();
    for (let x = 40; x <= w - 40; x += 6) {
      const y = yy + Math.sin(x * 0.05 + yy) * 4 + Math.abs(x - SUTURE_X) * 0.03;
      x === 40 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
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
    g.translate(b.x + (b.flip ? 11 : -11), b.y);
    g.rotate(0.12 * (b.flip ? -1 : 1));
    g.fillStyle = 'rgba(40,28,16,.4)';
    g.beginPath();
    g.ellipse(0, 0, 3, 8.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // 边缘渐暗：甲片的厚度
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(70,50,26,.16)';
  g.lineWidth = 26;
  inShape(g, (p) => g.stroke(p));
  g.strokeStyle = 'rgba(70,50,26,.22)';
  g.lineWidth = 11;
  inShape(g, (p) => g.stroke(p));
  g.restore();
  // 墨线勾边，枯笔式的断续
  g.save();
  g.strokeStyle = 'rgba(27,23,18,.62)';
  g.lineWidth = 2.1;
  g.setLineDash([180, 3, 90, 2, 240, 4]);
  inShape(g, (p) => g.stroke(p));
  g.restore();
}

/**
 * 画几道兆。list 里每一项是 { crack, spot, t }：兆落在第 spot 处钻凿对应的位置，裂纹到中缝为止。
 */
export function paintCracks(g, list, opts = {}) {
  for (const c of list) {
    if (!c) continue;
    const { x, y, flip } = spotPos(c.spot);
    g.save();
    g.beginPath();
    if (flip) g.rect(SUTURE_X + 5, 0, FIG_W, 2000);
    else g.rect(0, 0, SUTURE_X - 5, 2000);
    g.clip();
    paintCrack(g, c.crack, { x, y, k: CRACK_K, t: c.t ?? 1, flip, ...opts });
    g.restore();
  }
}

/**
 * 刻辞的版面（设计坐标）：每一列的中心 x 与起笔 y。页面（OmenFigure.svelte）与分享图（poster.js）共用。
 * 竖排，自右向左读：前辞、命辞（可能几列）、占辞；对贞辞在另一半。
 * 字写在兆的下方（兆在第三排时写在上方），避开裂纹。carve 需带 mainSpot（以及 fanSpot）。
 */
export const CARVE = { pitchX: 26, pitchY: 21.5, font: 20, colH: 8 * 21.5 };
export function carveLayout(carve) {
  if (!carve || carve.mainSpot == null) return [];
  const { pitchX, colH } = CARVE;
  const main = spotPos(carve.mainSpot);
  const fan = carve.fanSpot != null ? spotPos(carve.fanSpot) : null;
  const lowest = Math.max(main.y, fan?.y ?? 0);
  const top = lowest + 30 + colH <= FIG_H - 20 ? lowest + 30 : 56;
  const block = (cols, right) => cols.map((c, i) => {
    const edge = right ? FIG_W - 64 : 64 + cols.length * pitchX;
    return { ...c, x: edge - pitchX / 2 - i * pitchX, y: top, n: i };
  });
  const mainCols = [{ t: carve.qian, k: 'qian' }, ...carve.ming.map((t) => ({ t, k: 'ming' })), ...carve.zhan.map((t) => ({ t, k: 'zhan' }))];
  const out = block(mainCols, main.flip);
  if (fan && carve.fanMing) {
    const fanCols = [...carve.fanMing.map((t) => ({ t, k: 'ming' })), ...(carve.fanZhao ?? []).map((t) => ({ t, k: 'zhan' }))];
    out.push(...block(fanCols, fan.flip).map((c) => ({ ...c, n: c.n + 2 })));
  }
  return out;
}
