// 书里的坐标 ↔ 屏幕坐标（docs/DESIGN.md §19）。
//
// 书放在整体缩放的场景里，还向后倾倒了几度（book.css 的 .scene、.book），getBoundingClientRect 量出的是屏幕上的外接矩形，
// 不能直接当页面里的 px 用。.huaxin 的四个角各有一个零尺寸的探针（.probe），读出它们在屏幕上的位置，就得到书在屏幕上的四边形；
// 由它解出一个透视变换，可以在“页面坐标”（px，原点在 .huaxin 左上角）与屏幕坐标之间来回换算。每次调用只读四个矩形。

/** @param {HTMLElement} huaxin */
export function bookMap(huaxin) {
  const pt = (c) => { const r = huaxin.querySelector(`.probe-${c}`).getBoundingClientRect(); return [r.left, r.top]; };
  const W = huaxin.offsetWidth || 1;
  const H = huaxin.offsetHeight || 1;
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = [pt('tl'), pt('tr'), pt('br'), pt('bl')];
  // 单位正方形 (0,0)(1,0)(1,1)(0,1) → 屏幕四边形（Heckbert）
  const dx1 = x1 - x2; const dx2 = x3 - x2; const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2; const dy2 = y3 - y2; const dy3 = y0 - y1 + y2 - y3;
  let g = 0; let h = 0;
  const den = dx1 * dy2 - dy1 * dx2;
  if ((dx3 || dy3) && den) {
    g = (dx3 * dy2 - dy3 * dx2) / den;
    h = (dx1 * dy3 - dy1 * dx3) / den;
  }
  const a = x1 - x0 + g * x1; const b = x3 - x0 + h * x3; const c = x0;
  const d = y1 - y0 + g * y1; const e = y3 - y0 + h * y3; const f = y0;
  // 逆矩阵（3×3 的伴随矩阵；比例系数在齐次除法里会消掉）
  const A = e - f * h; const B = c * h - b; const C = b * f - c * e;
  const D = f * g - d; const E = a - c * g; const F = c * d - a * f;
  const G = d * h - e * g; const Hh = b * g - a * h; const I = a * e - b * d;
  return {
    W, H,
    /** 屏幕 (x, y) → 页面坐标 [px, py] */
    toLocal(x, y) {
      const w = G * x + Hh * y + I;
      return [((A * x + B * y + C) / w) * W, ((D * x + E * y + F) / w) * H];
    },
    /** 页面坐标 → 屏幕坐标 */
    toScreen(px, py) {
      const u = px / W; const v = py / H;
      const w = g * u + h * v + 1;
      return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
    },
    /** 屏幕上的一个矩形 → 页面坐标里的外接矩形 { l, t, r, b } */
    rect(r) {
      const p = [this.toLocal(r.left, r.top), this.toLocal(r.right, r.top), this.toLocal(r.left, r.bottom), this.toLocal(r.right, r.bottom)];
      const xs = p.map((q) => q[0]); const ys = p.map((q) => q[1]);
      return { l: Math.min(...xs), t: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) };
    },
  };
}
