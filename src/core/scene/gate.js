// 3D 场景层的准入（docs/DESIGN.md §18）：什么时候用 three.js，什么时候退回 2D 字盘。
// 以下任何一条成立都退回 2D：手机宽度（< 960px）、触屏为主（pointer: coarse）、减少动效、WebGL 不可用。
// 这里只用到原生 API，不引入 three；three 在真正要用时才由 board.js 动态 import。

export const WIDE = 960;

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false, addEventListener() {}, removeEventListener() {} });
export const reducedQuery = mq('(prefers-reduced-motion: reduce)');
export const coarseQuery = mq('(pointer: coarse)');

let glOk = null;
export function webglAvailable() {
  if (glOk !== null) return glOk;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    glOk = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { glOk = false; }
  return glOk;
}

/** 此刻该不该用 3D（强制 ?scene=2d 可关掉，?scene=3d 不绕过上述条件） */
export function want3D() {
  if (new URLSearchParams(location.search).get('scene') === '2d') return false;
  if (reducedQuery.matches || coarseQuery.matches) return false;
  if (innerWidth < WIDE) return false;
  return webglAvailable();
}
