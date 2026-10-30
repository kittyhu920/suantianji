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
      if (location.search.includes('debug')) {
        window.__desk = deskRef;
        // 穿模检查：window.__desk.overlaps() 列出互相穿插的东西与低于桌面的东西（scene/overlaps.js）
        import('./overlaps.js').then(({ createOverlaps }) => { deskRef.overlaps = createOverlaps(desk, deskRef); });
        // 屏幕空间的遮挡检查：器物挡扉页文字、DOM 纸笺压器物或书（scene/occlusions.js）
        import('./occlusions.js').then(({ createOcclusions }) => { deskRef.occlusions = createOcclusions(desk, deskRef); });
      }
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
  const box = new THREE.Box3();
  if (p.measure) p.measure(box); // 器物自己说哪几个网格算它的身体（龟甲：不算接触影、炭条、烟）
  else box.setFromObject(p.group);
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
 *   at3d   [x, z]：不按版面，直接指定器物在桌面上的位置（厘米）。需要用别的东西（纸笺）围着器物排版时用它，
 *          排版的一方再按器物投影到屏幕上的矩形来摆（见下面的 beside）
 */
const slotCount = {};
export function slot(node, opt) {
  let o = opt;
  slotCount[o.id] = (slotCount[o.id] ?? 0) + 1;
  const place = () => {
    const { desk, pieces } = deskRef;
    if (!desk || !pieces) return;
    if (desk.focusing) return; // 镜头在推近（灼卜）：屏幕上的位置对应的桌面位置变了，器物不能跟着跑
    if (o.at3d) { if (o.id !== 'jiao') pieces.place(o.id, o.at3d[0], o.at3d[1], o.s); return; }
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
      // 下一屏没有给落脚处的话，器物回到仪式的默认位置（settle）
      slotCount[o.id]--;
      if (o.id !== 'jiao') setTimeout(() => { if (!slotCount[o.id]) deskRef.pieces?.settle(o.id); }, 90);
    },
  };
}

/**
 * 一张 DOM 的纸笺摆在某件 3D 器物的旁边（不压在器物上）：按器物此刻投影到屏幕上的矩形来摆，镜头、窗口怎么变都不重叠。
 *   id     器物 id
 *   side   'right' | 'left'：摆在器物的右边或左边；这一侧放不下（画布不够宽）就换另一侧，再不行就缩窄
 *   gap    与器物的间距（屏幕像素，默认 16）
 * 纸笺要在 position: relative 的 .desk-items 里；位置写进 left / top（按场景的缩放 --k 换算）。
 */
export function beside(node, opt) {
  let o = opt;
  const place = () => {
    const { desk } = deskRef;
    if (!desk || desk.focusing) return;
    const r = pieceRect(o.id);
    const parent = node.offsetParent;
    if (!r || !parent) return;
    const pr = parent.getBoundingClientRect();
    const kk = pr.width / parent.offsetWidth || 1;
    const c = desk.rect;
    const gap = o.gap ?? 16;
    const margin = 10;
    node.style.position = 'absolute';
    node.style.maxWidth = '';
    const W0 = node.offsetWidth * kk;
    const roomR = c.left + c.width - margin - (c.left + r.x + r.w + gap);
    const roomL = c.left + r.x - gap - (c.left + margin);
    let side = o.side;
    if ((side === 'right' ? roomR : roomL) < W0 && (side === 'right' ? roomL : roomR) > (side === 'right' ? roomR : roomL)) side = side === 'right' ? 'left' : 'right';
    const room = side === 'right' ? roomR : roomL;
    if (room < W0) node.style.maxWidth = `${Math.max(160, room) / kk}px`;
    const W = Math.min(W0, Math.max(160, room));
    const sx = side === 'right' ? c.left + r.x + r.w + gap : c.left + r.x - gap - W;
    const sy = c.top + r.y + (o.dy ?? 0);
    node.style.left = `${(sx - pr.left) / kk}px`;
    node.style.top = `${(sy - pr.top) / kk}px`;
  };
  let ro = null;
  let stopWatch = null;
  const start = () => {
    const { desk } = deskRef;
    if (!desk || ro) return;
    ro = new ResizeObserver(place);
    ro.observe(node);
    let v = -1;
    let sig = '';
    const f = () => {
      // 镜头动了，或器物自己在桌上走（落脚处的位置在变）：重新摆
      const r = pieceRect(o.id);
      const s = r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : '';
      if (desk.view.version !== v || s !== sig) { v = desk.view.version; sig = s; place(); }
    };
    desk.listeners.add(f);
    stopWatch = () => desk.listeners.delete(f);
    place();
  };
  start();
  const timers = [120, 450, 950].map((ms) => setTimeout(place, ms)); // 桌上的版面有入场动画：落定之后再量一次
  addEventListener('resize', place);
  return {
    update(next) { o = next; place(); start(); },
    destroy() { ro?.disconnect(); stopWatch?.(); timers.forEach(clearTimeout); removeEventListener('resize', place); },
  };
}
