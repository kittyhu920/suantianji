// 穿模检查（只在 ?debug 下，由 desk.svelte.js 挂到 window.__desk.overlaps）：
// 对场景里每件看得见、有实体的东西（器物、木签、书的各部分、翻着的纸），算世界坐标里的定向包围盒（OBB），
// 逐对用分离轴测试找出互相穿插的，并列出低于桌面的。结果是纯数据，方便在浏览器脚本里读：
//   window.__desk.overlaps()                → { pairs: [{ a, b, depth }], below: [{ name, y }], count }
//   window.__desk.overlaps({ tol: 0.15 })   → 穿插深度（厘米）小于 tol 的当作“挨着”，不算（默认 0.04：纸薄，别把压在纸上的东西漏掉）
// 同一件东西自己的零件之间不比（签筒里的签与筒、书的封面与书页）；书的零件之间只比“封面与纸叠”这类不该穿的。
// 不比：看不见的、透明的、不写深度的（接触影、墨点、烟）、拾取用的替身。

// 本来就该挨着、咬合的：书脊的布包住封面与书页的边（任意深度）；封面绕书脊转，铰链处封面的厚度与书页、纸叠互相让不开，不超过 0.7 的不算
const LEGIT = [['书:封面', '书:书脊'], ['书:书页与底板', '书:书脊']];
const HINGE = new Set(['书:书页与底板', '书:未读的纸叠', '书:读过的纸叠']);
const HINGE_MAX = 0.7;

export function createOverlaps(desk, deskRef) {
  const { THREE } = desk;
  const V = () => new THREE.Vector3();

  const isLive = (o) => {
    for (let n = o; n; n = n.parent) if (!n.visible) return false;
    return true;
  };
  const solid = (m) => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat || mat.visible === false) return false;
    if (mat.depthWrite === false) return false;
    if (mat.transparent && mat.opacity < 0.05) return false;
    return true;
  };

  /** 一个网格的定向包围盒：中心、三根半轴（世界）。几何的包围盒按现在的顶点重算（翻着的纸每帧在变） */
  function obb(m) {
    const g = m.geometry;
    if (!g.boundingBox || g.userData.liveBox) g.computeBoundingBox();
    const b = g.boundingBox;
    if (!b || !isFinite(b.min.x)) return null;
    m.updateWorldMatrix(true, false);
    const e = m.matrixWorld.elements;
    const c = b.getCenter(V()).applyMatrix4(m.matrixWorld);
    const half = b.getSize(V()).multiplyScalar(0.5);
    const ax = [0, 1, 2].map((i) => V().set(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]).multiplyScalar(half.getComponent(i)));
    return { c, ax };
  }

  /** 一个网格最低的顶点（世界 y）：低于桌面要按真实的顶点量，不能用包围盒的角（倾斜的壳、竹筒的包围盒角会比实体低很多） */
  function lowestY(m) {
    m.updateWorldMatrix(true, false);
    const e = m.matrixWorld.elements;
    const p = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 600));
    let lo = Infinity;
    for (let i = 0; i < p.count; i += step) lo = Math.min(lo, e[1] * p.getX(i) + e[5] * p.getY(i) + e[9] * p.getZ(i) + e[13]);
    return lo;
  }

  /** 两个 OBB 的分离轴测试：不相交返回 0，相交返回最小的穿插深度（沿最浅的那根轴） */
  function depth(A, B, shrink) {
    const axes = [];
    for (const a of A.ax) axes.push(a.clone().normalize());
    for (const b of B.ax) axes.push(b.clone().normalize());
    for (const a of A.ax) for (const b of B.ax) {
      const x = V().crossVectors(a, b);
      if (x.lengthSq() > 1e-8) axes.push(x.normalize());
    }
    const d = V().subVectors(B.c, A.c);
    let best = Infinity;
    for (const n of axes) {
      const ra = A.ax.reduce((s, v) => s + Math.abs(v.dot(n)), 0) - shrink;
      const rb = B.ax.reduce((s, v) => s + Math.abs(v.dot(n)), 0) - shrink;
      const gap = Math.abs(d.dot(n)) - (ra + rb);
      if (gap >= 0) return 0;
      best = Math.min(best, -gap);
    }
    return best;
  }

  /** 场景里的“东西”：{ name, root, meshes[] }。root 相同的网格属于同一件，互相不比 */
  function collect() {
    const items = [];
    const meshesOf = (obj, skip) => {
      const out = [];
      obj.traverse((o) => { if (o.isMesh && !skip?.(o) && isLive(o) && solid(o)) out.push(o); });
      return out;
    };
    const { pieces, book } = deskRef;
    for (const [id, p] of Object.entries(pieces?.list ?? {})) {
      if (!p.wrap.visible || p.pose.P.s < 0.05) continue;
      items.push({ name: `器物:${id}`, root: `p:${id}`, meshes: meshesOf(p.group) });
      if (p.tag?.visible) items.push({ name: `木签:${id}`, root: `t:${id}`, meshes: meshesOf(p.tag) });
      if (p.cups?.group.visible) items.push({ name: '筊杯', root: 'cups', meshes: meshesOf(p.cups.group) });
    }
    if (book?.root.visible && book.mode !== 'doc') { // 讲解页时书沉在桌面下面，不比
      const inner = book.inner;
      const part = (name, pick) => {
        const ms = [];
        inner.traverse((o) => { if (o.isMesh && pick(o) && isLive(o) && solid(o)) ms.push(o); });
        if (ms.length) items.push({ name: `书:${name}`, root: `b:${name}`, meshes: ms });
      };
      const cover = book.parts?.cover;
      part('封面', (o) => o === cover);
      part('书页与底板', (o) => o === book.parts?.board || o === book.parts?.block);
      part('书脊', (o) => o === book.parts?.spine);
      // 命书的纸：翻着的（p 在 0..1 之间）每张一件，未动的左右两叠各算一件
      const sheets = book.reading?.list ?? [];
      const rest = { 0: [], 1: [] };
      sheets.forEach((s) => {
        s.fMesh.geometry.userData.liveBox = true; // 每张纸的包围盒都按现在的顶点重算（只在翻着的时候才重算，纸合上之后用的是翻开时的旧盒子，会误报）
        if (s.st.p > 0.001 && s.st.p < 0.999) {
          s.fMesh.geometry.userData.liveBox = true;
          items.push({ name: `书:翻着的纸${s.i}`, root: `s:${s.i}`, meshes: [s.fMesh] });
        } else rest[s.st.p >= 0.999 ? 1 : 0].push(s.fMesh);
      });
      if (rest[0].length) items.push({ name: '书:未读的纸叠', root: 's:R', meshes: rest[0] });
      if (rest[1].length) items.push({ name: '书:读过的纸叠', root: 's:L', meshes: rest[1] });
    }
    return items.filter((it) => it.meshes.length);
  }

  return function overlaps({ tol = 0.04, tableTol = 0.12 } = {}) {
    desk.root.updateMatrixWorld(true);
    const items = collect();
    const boxes = items.map((it) => it.meshes.map((m) => ({ m, b: obb(m) })).filter((x) => x.b));
    const pairs = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        let worst = 0;
        let who = '';
        for (const x of boxes[i]) for (const y of boxes[j]) {
          // 粗筛：中心距超过半径之和
          const d = depth(x.b, y.b, 0);
          if (d > worst) { worst = d; who = `${x.m.name || x.m.geometry.type}×${y.m.name || y.m.geometry.type}`; }
        }
        const names = [items[i].name, items[j].name];
        if (names.every((n) => n.startsWith('书:翻着的纸') || n === '书:未读的纸叠' || n === '书:读过的纸叠')) continue; // 纸与纸的层次由 curl.js 排好（每张纸有自己的高度），不比
        if (names.includes('书:封面') && names.some((n) => HINGE.has(n)) && worst <= HINGE_MAX) continue;
        if (worst > tol && !LEGIT.some(([p, q]) => (p === items[i].name && q === items[j].name) || (p === items[j].name && q === items[i].name))) pairs.push({ a: items[i].name, b: items[j].name, depth: +worst.toFixed(2), meshes: who });
      }
    }
    // 低于桌面：包围盒最低点在 y = 0 之下
    const below = [];
    items.forEach((it, i) => {
      let lo = Infinity;
      let who = null;
      for (const x of boxes[i]) {
        const y = lowestY(x.m);
        if (y < lo) { lo = y; who = x; }
      }
      if (lo < -tableTol) below.push({ name: it.name, y: +lo.toFixed(2), mesh: `${who.m.geometry.type}@(${who.b.c.x.toFixed(1)},${who.b.c.y.toFixed(1)},${who.b.c.z.toFixed(1)})` });
    });
    // 越出桌面（x ±56、z ±36）：整件东西的包围盒出了桌沿
    const off = [];
    const HX = desk.TABLE.w / 2;
    const HZ = desk.TABLE.d / 2;
    items.forEach((it, i) => {
      let x1 = -Infinity; let x0 = Infinity; let z1 = -Infinity; let z0 = Infinity;
      for (const x of boxes[i]) {
        const rx = x.b.ax.reduce((s, v) => s + Math.abs(v.x), 0);
        const rz = x.b.ax.reduce((s, v) => s + Math.abs(v.z), 0);
        x0 = Math.min(x0, x.b.c.x - rx); x1 = Math.max(x1, x.b.c.x + rx);
        z0 = Math.min(z0, x.b.c.z - rz); z1 = Math.max(z1, x.b.c.z + rz);
      }
      const over = Math.max(x1 - HX, -HX - x0, z1 - HZ, -HZ - z0);
      if (over > 0.3) off.push({ name: it.name, over: +over.toFixed(2) });
    });
    pairs.sort((p, q) => q.depth - p.depth);
    return { count: pairs.length + below.length + off.length, pairs, below, off };
  };
}
