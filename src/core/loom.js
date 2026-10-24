// 数纬：把每一次操作织成一幅锦（织法的框架在这里，各卷只提供"每一种操作的丝是什么形态"）
// 每一次操作是一束丝，自下而上按先后排列。左半是你来时，右半是"回答"。
// 被你弃掉的那一次（kept 为 false）也织进去，只是淡一些——重来越多，锦越乱。
// 所有丝线都连续穿过中缝，织它的始终是同一个人。
//
// 画法（性能）：每束丝先在内存里走完全程，再把相邻 RUN 段并成一笔画出，丝的总数封顶。
// 早先是一段一笔、每次操作约 60 束丝：起卦三次就有数十万次 multiply 混合的微小描边，分享图导出时 toBlob 一次性光栅化，
// 浏览器会卡死；现在总笔数在两万多笔以内，且每画若干笔就让出一次主线程。
//
// 各卷的织法 style（可选，缺省时所有丝都是平直的墨线；签卷见 src/juan/qian/loom-style.js）：
//   halos(kind)                  这一束丝底下除了墨底之外的晕：[{ cx, rx, ry, color, a }]，cx、rx 是画布宽的倍数，ry 是丝带厚度的倍数
//   offset(kind, off, o, x, g)   丝在横坐标 x 处的纵向偏移（off 为默认值，o 为丝在带内的位置 -1..1，g = { W, thick }）
//   color(kind, x, W)            丝在 x 处的颜色 [r,g,b]；返回 null 用墨色

import { mulberry32 } from './rng.js';

// 两套配色：浅色是宣纸上的墨丝（正片叠底），深色是墨底上的淡金丝（滤色叠加）
const PALETTE = {
  light: { ink: [27, 23, 18], zhu: [179, 38, 31], stray: [120, 108, 90], paper: '#efe6d0', warp: 'rgba(179,38,31,0.05)', blend: 'multiply' },
  dark: { ink: [226, 208, 160], zhu: [226, 84, 66], stray: [150, 140, 118], paper: '#15130f', warp: 'rgba(226,208,160,0.045)', blend: 'screen' },
};
let pal = PALETTE.light;
export const LOOM = { // 供各卷的织法取色（织的过程中读，随这一幅的主题）
  get ink() { return pal.ink; },
  get zhu() { return pal.zhu; },
};

export const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;

// width：直接指定像素宽度（按页面的纹理尺寸画），缺省按画布的显示宽度
// dark：深色画面（滤色叠加）；缺省是宣纸上的墨丝（正片叠底）
const RUN = 7; // 相邻几段并成一笔
const MAX_THREADS = 360; // 丝的总数封顶：不论织了几次，笔数都不会无限增长
const YIELD_EVERY = 5000; // 每画这么多笔就让出主线程

export async function weave(canvas, { seed, throws, width, style = {}, dark = false }) {
  pal = dark ? PALETTE.dark : PALETTE.light;
  const P = pal;
  // 指定宽度时，按页面上约 380px 宽的命盘等比放大丝线粗细
  const dpr = width ? width / 380 : Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.round(width ?? canvas.clientWidth * dpr);
  const H = Math.round(W * 0.75);
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const rand = mulberry32(seed);

  // 宣纸底 + 经线
  g.fillStyle = P.paper; // 宣纸（深色：墨底）
  g.fillRect(0, 0, W, H);
  g.strokeStyle = P.warp; // 经线用极淡的丝：一次描完
  g.lineWidth = 1;
  const warp = 5 * dpr;
  g.beginPath();
  for (let x = warp / 2; x < W; x += warp) {
    g.moveTo(x, 0);
    g.lineTo(x, H);
  }
  g.stroke();

  // 至少按三束排布，掷得少时居中
  const slots = Math.max(3, throws.length);
  const bandH = (H * 0.84) / slots;
  const thick = bandH * 0.64;
  const top = H * 0.08 + ((slots - throws.length) * bandH) / 2;
  const center = (b) => top + throws.length * bandH - (b + 0.5) * bandH;

  // 墨底：每一束丝下面先洇一片淡墨，丝落在湿纸上；被弃掉的那一掷更淡。阴杯的右半，淡淡地带朱
  const soft = (cx, cy, rx, ry, c, a) => {
    g.save();
    g.translate(cx, cy);
    g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
    gr.addColorStop(0.6, `rgba(${c[0]},${c[1]},${c[2]},${a * 0.45})`);
    gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = gr;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  };
  for (let b = 0; b < throws.length; b++) {
    const { kind, kept } = throws[b];
    const k = kept ? 1 : 0.4;
    soft(W * 0.5, center(b), W * 0.62, thick * 0.95, P.ink, (dark ? 0.045 : 0.06) * k);
    for (const h of style.halos?.(kind) ?? []) soft(W * h.cx, center(b), W * h.rx, thick * h.ry, h.color, h.a * k);
  }

  const perBand = Math.max(8, Math.min(Math.round((58 + rand() * 14) * Math.min(1, 6 / slots + 0.3)), Math.floor(MAX_THREADS / Math.max(1, throws.length))));
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
        kp: 0.8 + rand() * 1.8, pp: rand() * Math.PI * 2, // 笔压：沿途时轻时重
        a: (stray ? 0.16 : 0.1 + rand() * 0.18) * (kept ? 1 : 0.4),
        w: (stray ? 0.9 : 0.5 + rand() * 0.7) * dpr,
        x: -8, y: center(b) + o * thick / 2,
      });
    }
  }

  const target = (th, x) => {
    let off = th.o * thick / 2;
    if (style.offset) off = style.offset(th.kind, off, th.o, x, { W, thick });
    const u = (x / W) * Math.PI * 2;
    const wob = Math.sin(u * th.k1 + th.p1) * thick * 0.05 + Math.sin(u * th.k2 + th.p2) * thick * 0.015;
    const drift = th.stray ? Math.sin(u * th.ks + th.ps) * bandH * 1.1 : 0;
    return center(th.b) + off + wob + drift;
  };

  const colorAt = (th, x) => {
    if (th.stray) return P.stray;
    return style.color?.(th.kind, x, W) ?? P.ink;
  };

  g.globalCompositeOperation = P.blend; // 墨线越密越浓（深色下是金线越密越亮）
  g.lineCap = 'butt'; // 平头：相邻线段的圆头叠在一起，透明度会叠出一串串小珠
  g.lineJoin = 'round';
  const step = W / 420;
  let strokes = 0;

  for (const th of threads) {
    th.y = target(th, th.x); // 先让丝线在画外就位，免得起笔处有收束痕迹
    while (th.x < W + 8) {
      // 走满一笔（RUN 段），段内笔压、颜色取平均，飞白处断开
      const pts = [[th.x, th.y]];
      let a = 0;
      let w = 0;
      let n = 0;
      let rgb = [0, 0, 0];
      let cut = [];
      for (let k = 0; k < RUN && th.x < W + 8; k++) {
        const nx = th.x + step;
        const ny = lerp(th.y, target(th, nx), 0.22);
        const c = colorAt(th, nx);
        const press = 0.5 + 0.5 * Math.sin((nx / W) * Math.PI * 2 * th.kp + th.pp);
        const tail = smoothstep(W * 0.86, W, nx); // 收笔：越到右端越细越淡
        const dry = !th.stray && press < 0.1 && rand() < 0.55; // 笔压最轻处，丝断出一小截飞白
        cut.push(dry);
        pts.push([nx, ny]);
        if (!dry) {
          a += th.a * (0.9 + 0.7 * press) * (1 - 0.5 * tail);
          w += th.w * (0.62 + 0.8 * press) * (1 - 0.55 * tail);
          rgb = [rgb[0] + c[0], rgb[1] + c[1], rgb[2] + c[2]];
          n++;
        }
        th.x = nx;
        th.y = ny;
      }
      if (!n) continue;
      g.strokeStyle = `rgba(${Math.round(rgb[0] / n)},${Math.round(rgb[1] / n)},${Math.round(rgb[2] / n)},${(a / n).toFixed(3)})`;
      g.lineWidth = w / n;
      g.beginPath();
      let pen = false;
      for (let k = 1; k < pts.length; k++) {
        if (cut[k - 1]) { pen = false; continue; }
        if (!pen) { g.moveTo(pts[k - 1][0], pts[k - 1][1]); pen = true; }
        g.lineTo(pts[k][0], pts[k][1]);
      }
      g.stroke();
      if (++strokes % YIELD_EVERY === 0) await new Promise((r) => setTimeout(r));
    }
  }
  g.globalCompositeOperation = 'source-over';
}
