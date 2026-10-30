// 龟甲的正面：与背面（Plastron.svelte）是同一块甲、同一个轮廓，翻面时左右镜像。用 Canvas 画成淡墨的写意（不用位图）。
// 页面上的兆图（OmenFigure.svelte）与分享图（poster.js）共用 paintShell / paintCracks / carveLayout，
// 所以两处的甲、兆与刻辞是同一份画法、同一份数据。
//
// 坐标：兆图的设计宽度 400、高 560（与背面 300 × 420 同比例，放大 4/3）。
// 兆落在对应钻凿的位置：背面在左边的钻凿，翻过来在右边（x 取镜像），所以 spotPos 把 x 翻过来。

import { mulberry32 } from '../../core/rng.js';
import { paintCrack, crackBounds } from './crack.js';
import { SPOTS } from './data.js';

export const FIG_W = 400;
export const FIG_H = 560;
export const SUTURE_X = FIG_W / 2;
// 兆纹放大的倍数。兆干的名义长 100 × 0.85–1.17，乘 2.5 之后占甲长（525）的 40%–56%，桌上（3D 的龟甲）一眼看得见；
// 以前是 1.25（兆干只占甲长的 1/4 以下，落在钻凿上方一小道）。兆象的判读（omen.js）只看兆的几何比例，不受影响
export const CRACK_K = 2.5;
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

// 甲的外轮廓（兆图坐标）采样成折线：兆落位时按 x 取甲在这一列上的上沿与下沿，兆干不要伸到甲外
let outlinePoly = null;
function polyline() {
  if (outlinePoly) return outlinePoly;
  const nums = PLASTRON_D.match(/[MCZ]|-?\d+\.?\d*/g);
  const pts = [];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < nums.length;) {
    const c = nums[i++];
    if (c === 'M') { cx = +nums[i++]; cy = +nums[i++]; pts.push([cx * S, cy * S]); } else if (c === 'C') {
      const [x1, y1, x2, y2, x3, y3] = [0, 1, 2, 3, 4, 5].map(() => +nums[i++]);
      for (let k = 1; k <= 24; k++) {
        const t = k / 24;
        const u = 1 - t;
        pts.push([(u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3) * S, (u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3) * S]);
      }
      cx = x3; cy = y3;
    }
  }
  return (outlinePoly = pts);
}
/** 甲在横坐标 x 这一列上的 [上沿, 下沿]（兆图坐标） */
export function shellSpan(x) {
  const p = polyline();
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, ay] = p[i];
    const [bx, by] = p[i + 1];
    if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
    const y = ay + ((by - ay) * (x - ax)) / (bx - ax);
    lo = Math.min(lo, y);
    hi = Math.max(hi, y);
  }
  return [lo, hi];
}

/**
 * 一道兆落在甲上的位置与大小（兆图坐标）。兆枝分出的那一点落在钻凿上（兆干穿过钻凿，像“卜”字），
 * 兆干上下各伸出一截，整道兆再被推回甲的轮廓以内（上排的钻凿离甲顶不远，兆干要往下多伸一些）；
 * 放不下时按甲在这一列的高度缩小。返回 { x, y, k, flip, box }，box 是兆的外包围盒（含枝，到中缝为止的枝按全长算，保守）。
 */
export function crackPlacement(crack, spot, k = CRACK_K) {
  const sp = spotPos(spot);
  const b = crackBounds(crack);
  const j = crack.strokes[1].pts[0]; // 兆枝的起点 = 兆干上分出枝的那一点
  const sx = sp.flip ? -1 : 1;
  const M = 16;
  const [top, bot] = shellSpan(sp.x);
  const room = bot - top - M * 2;
  if ((b.y1 - b.y0) * k > room) k = room / (b.y1 - b.y0);
  const oy = Math.min(bot - M - b.y1 * k, Math.max(top + M - b.y0 * k, sp.y - j.y * k));
  const ox = sp.x - sx * j.x * k;
  const xs = [ox + sx * b.x0 * k, ox + sx * b.x1 * k];
  return { x: ox, y: oy, k, flip: sp.flip, box: { x0: Math.min(...xs), x1: Math.max(...xs), y0: oy + b.y0 * k, y1: oy + b.y1 * k } };
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
    const { x, y, k, flip } = crackPlacement(c.crack, c.spot);
    g.save();
    g.beginPath();
    if (flip) g.rect(SUTURE_X + 5, 0, FIG_W, 2000);
    else g.rect(0, 0, SUTURE_X - 5, 2000);
    g.clip();
    paintCrack(g, c.crack, { x, y, k, t: c.t ?? 1, flip, ...opts });
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
  const mainCols = [{ t: carve.qian, k: 'qian' }, ...carve.ming.map((t) => ({ t, k: 'ming' })), ...carve.zhan.map((t) => ({ t, k: 'zhan' }))];
  const fanCols = fan && carve.fanMing ? [...carve.fanMing.map((t) => ({ t, k: 'ming' })), ...(carve.fanZhao ?? []).map((t) => ({ t, k: 'zhan' }))] : null;
  // 兆变大了：字要躲开兆的外包围盒。没有兆的数据时（旧调用），写在最低的钻凿下面
  const boxes = [];
  if (carve.mainCrack) boxes.push(crackPlacement(carve.mainCrack, carve.mainSpot).box);
  if (fan && carve.fanCrack) boxes.push(crackPlacement(carve.fanCrack, carve.fanSpot).box);
  const edgeOf = (cols, right) => (right ? FIG_W - 64 : 64 + cols.length * pitchX);
  const rectOf = (cols, right, top) => { const e = edgeOf(cols, right); return { x0: e - cols.length * pitchX, x1: e, y0: top, y1: top + colH }; };
  const hit = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const block = (cols, right, top) => cols.map((c, i) => ({ ...c, x: edgeOf(cols, right) - pitchX / 2 - i * pitchX, y: top, n: i }));
  const inShell = (r) => [r.x0, r.x1].every((x) => { const [t, b] = shellSpan(x); return r.y0 >= t + 10 && r.y1 <= b - 10; });
  const lowest = Math.max(main.y, fan?.y ?? 0);
  const defTop = Math.max(56, Math.min(FIG_H - 20 - colH, lowest + 30)); // 以前的写法：最低的钻凿下面
  const place = (cols, pref, avoid) => {
    if (!boxes.length) return { right: pref, top: lowest + 30 + colH <= FIG_H - 20 ? lowest + 30 : 56 };
    let best = null;
    for (const right of [pref, !pref]) {
      for (let top = 56; top <= FIG_H - 20 - colH; top += 6) {
        const r = rectOf(cols, right, top);
        const cost = boxes.reduce((s, bx) => s + hit(r, { x0: bx.x0 - 8, x1: bx.x1 + 8, y0: bx.y0 - 8, y1: bx.y1 + 8 }), 0)
          + avoid.reduce((s, a) => s + hit(r, a) * 4, 0) + (inShell(r) ? 0 : 5000) + (right === pref ? 0 : 1) + Math.abs(top - defTop) * 1e-4;
        if (!best || cost < best.cost - 1e-9) best = { cost, right, top };
      }
    }
    return best;
  };
  const a = place(mainCols, main.flip, []);
  const out = block(mainCols, a.right, a.top);
  if (fanCols) {
    const used = [rectOf(mainCols, a.right, a.top)];
    const b = place(fanCols, fan.flip, used);
    out.push(...block(fanCols, b.right, b.top).map((c) => ({ ...c, n: c.n + 2 })));
  }
  return out;
}
