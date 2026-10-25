// 灯下书桌的接线（docs/DESIGN.md §19）：什么时候用 3D、把 three.js 场景与页面（Codex.svelte、各卷的屏）接起来。
//   deskState.on      3D 书桌已经就绪（页面据此换掉 2D 的桌面、器物与书）
//   deskRef           场景句柄：{ desk, pieces, book }，没有 3D 时都是 null
//   slot(node, opt)   Svelte 动作：版面里的一个"落脚处"，器物走到它所在的桌面位置（桌上的器物是同一个 3D 物件，只是位姿随版面）
// 退回 2D 的条件（任何一条）：窗口宽度 < 960px、减少动效、WebGL 不可用、?scene=2d。

import { reducedQuery, webglAvailable, WIDE } from './gate.js';

export const deskState = $state({ on: false, hover: null, rects: {} });
export const deskRef = { desk: null, pieces: null, book: null };

export function wantDeskGL() {
  if (typeof location === 'undefined') return false;
  if (new URLSearchParams(location.search).get('scene') === '2d') return false;
  if (reducedQuery.matches || innerWidth < WIDE) return false;
  return webglAvailable();
}

let starting = null;

/** 起 3D 书桌：host 是 .table。成功时 deskState.on 为真。重复调用安全 */
export function startDesk(host, { juans, onOpen, onHover, onLost }) {
  if (deskRef.desk) return Promise.resolve(true);
  if (starting) return starting;
  starting = (async () => {
    try {
      const [{ createDesk }, { createBook }, { createPieces }] = await Promise.all([
        import('./desk3d.js'), import('./book3d.js'), import('./pieces/index.js'),
      ]);
      const desk = await createDesk(host, { onLost: () => { stopDesk(); onLost?.(); } });
      const book = createBook(desk);
      desk.book = book;
      const pieces = createPieces(desk, juans, { onOpen, onHover });
      deskRef.desk = desk;
      deskRef.book = book;
      deskRef.pieces = pieces;
      deskState.on = true;
      if (location.search.includes('debug')) window.__desk = deskRef;
      return true;
    } catch (e) {
      console.warn('[desk] 3D 书桌起不来，退回 2D', e);
      stopDesk();
      return false;
    } finally {
      starting = null;
    }
  })();
  return starting;
}

export function stopDesk() {
  deskState.on = false;
  deskState.hover = null;
  const { desk, pieces } = deskRef;
  deskRef.desk = deskRef.pieces = deskRef.book = null;
  try { pieces?.destroy(); desk?.destroy(); } catch { /* 已经没了 */ }
}

/** 一件器物此刻在画布上占的矩形（CSS 像素，相对画布左上角） */
export function pieceRect(id) {
  const { desk, pieces } = deskRef;
  const p = pieces?.list[id];
  if (!desk || !p) return null;
  const THREE = desk.THREE;
  p.wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(p.group);
  let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const q = desk.project(new THREE.Vector3(x, y, z));
    x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 版面里的落脚处：器物走到它所在的桌面位置。
 *   id     器物 id（'qian'、'gua'、'bu'，掷筊的筊杯用 'jiao'）
 *   at     [横, 纵]：落脚处矩形里哪一点是器物的底（0..1），默认底边中心
 *   s      仪式中的放大（不给就用默认）
 */
export function slot(node, opt) {
  let o = opt;
  const place = () => {
    const { desk, pieces } = deskRef;
    if (!desk || !pieces) return;
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const c = desk.rect;
    const at = o.at ?? [0.5, 0.5];
    const p = desk.floorAt(r.left - c.left + r.width * at[0], r.top - c.top + r.height * at[1]);
    if (!p) return;
    if (o.id === 'jiao') {
      const cups = pieces.list.qian?.cups;
      if (cups) { cups.group.position.set(p.x, 0, p.z); desk.invalidate(); }
    } else pieces.place(o.id, p.x, p.z, o.s);
  };
  let ro = null;
  let stopWatch = null;
  const timers = [];
  const start = () => {
    const { desk } = deskRef;
    if (!desk) return;
    place();
    ro = new ResizeObserver(place);
    ro.observe(node);
    let v = desk.view.version;
    const f = () => { if (desk.view.version !== v) { v = desk.view.version; place(); } };
    desk.listeners.add(f);
    stopWatch = () => desk.listeners.delete(f);
    // 桌上的版面有入场动画：落定之后再量一次
    for (const ms of [120, 450, 950]) timers.push(setTimeout(place, ms));
    addEventListener('resize', place);
  };
  start();
  const on = () => { if (deskRef.desk && !ro) start(); };
  return {
    update(next) { o = next; place(); on(); },
    destroy() {
      ro?.disconnect();
      stopWatch?.();
      timers.forEach(clearTimeout);
      removeEventListener('resize', place);
    },
  };
}
