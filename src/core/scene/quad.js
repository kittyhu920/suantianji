// 把一个 w × h 的矩形（DOM 元素，transform-origin 在左上角）贴到屏幕上的任意四边形：算出透视变换，写成 CSS 的 matrix3d。
// 四边形的顶点按 [左上, 右上, 右下, 左下] 给，对应矩形的 (0,0) (w,0) (w,h) (0,h)。
// 用途：书的话是 DOM 里的字，扉页是 3D 里的一块平面；把字按扉页四个角的投影贴过去，字就"写"在扉页上了。

export function quadMatrix(q, w, h) {
  const [p0, p1, p2, p3] = q;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let hh = 0;
  if (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6) {
    const den = dx1 * dy2 - dy1 * dx2 || 1e-9;
    g = (dx3 * dy2 - dy3 * dx2) / den;
    hh = (dx1 * dy3 - dy1 * dx3) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + hh * p3.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + hh * p3.y;
  // 单位正方形 → 四边形 的矩阵 [[a,b,c],[d,e,f],[g,hh,1]]，再把 (x/w, y/h) 代进去
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, p0.x, p0.y, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(7)).join(',')})`;
}
