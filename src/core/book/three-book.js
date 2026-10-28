// 命书的纸（docs/DESIGN.md §19）：桌上那本书里的一叠纸。每张纸是一个细分的平面网格，翻页时按拖动点做圆柱/锥面卷曲（curl.js），
// 正反两面各贴一张 Canvas 画的纹理（背面隐约透出正面的字，合成在着色器里），光照与投影用桌上同一盏灯（翻起的纸投在下面的书页与桌上）。
// 它不再有自己的画布与相机：纸挂在 book3d.js 的书里（parent），渲染循环是桌子的（desk.addTicker / invalidate），
// 所以读命书时是同一本书原地摊开，不是另一本书叠上来。
// 只在需要时才渲染：静止时一帧不画；翻页时每帧只重算正在翻的那一张纸的顶点与法线，不重画任何纹理。
// 坐标：纸的局部坐标里 x 自书脊向书口（“右页”0..W，也就是还没读的那一叠），y 向书头，z 向上；一个单位 = SC 厘米（见 book3d.js 里的挂法）。
// 右装：整本书在世界里是镜像摆的，书脊在右，所以“右页”（未读的一叠）在屏幕的左边，翻过去的纸落在屏幕右边；下面的“左、右”都指纸自己的坐标。

import { sheetGrid, bend, spring } from './curl.js';

export const W = 500; // 页宽、页高（页的宽高比与纹理的 5:7 一致）
export const H = 700;
const COLS = 40;
const ROWS = 14;

const smooth = (t) => t * t * (3 - 2 * t);

/** 纸边的细纹（右侧与上下沿露出的一叠纸）：一张小画布 */
function edgeTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    g.fillStyle = y % 4 < 2 ? '#d8c9a4' : '#bfae86';
    g.fillRect(0, y, 8, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * desk    桌子（desk3d.js 的句柄）
 * parent  纸要挂在哪一个 Group 下面（已经摆好位置、旋转与缩放：局部的 x 向右、y 向书头、z 向上）
 * z0r/z0l 右边、左边那一叠最底下一张纸的高度（单位同上）；stack 一叠纸总共大约多厚
 */
export function createSheets(desk, parent, { z0r = 9, z0l = 13, stack = 32 } = {}) {
  const { THREE, invalidate, addTicker } = desk;
  const scene = parent;
  const sheets = [];
  const mats = [];
  const active = new Map(); // sheet -> { target, kind: 'spring' | 'drag' }
  const reveal = { body: 1, title: 1 }; // 扉页上的字浮现到哪了（书摊开的演出用）
  let N = 0;
  let T = 1.5; // 一张纸的厚度（层与层之间的间隔）
  let spreadNow = 0;
  let limit = 0; // 最多翻到第几个对页（最后一页真正的内容露出来为止，后面的空白不翻）
  let ticking = false;
  let disposed = false;

  // 纸边：左右两叠各三面（书口与上下沿），高度随这一叠的纸数变
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTexture(THREE), roughness: 0.95 });
  const edges = { R: [], L: [] };
  for (const side of ['R', 'L']) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), edgeMat);
      m.receiveShadow = true;
      m.visible = false;
      scene.add(m);
      edges[side].push(m);
    }
  }
  const setEdges = (side, count, base, topZ) => {
    const [out, bot, top] = edges[side];
    const h = Math.max(0.01, count ? topZ - base + T * 0.6 : 0.01);
    const zc = base - 0.2 + h / 2;
    const sx = side === 'R' ? 1 : -1;
    out.visible = bot.visible = top.visible = count > 0;
    out.scale.set(0.8, H - 2, h);
    out.position.set(sx * (W + 0.4), 0, zc);
    bot.scale.set(W - 2, 0.8, h);
    bot.position.set(sx * (W / 2), -H / 2 - 0.4, zc);
    top.scale.set(W - 2, 0.8, h);
    top.position.set(sx * (W / 2), H / 2 + 0.4, zc);
  };

  // 纸：每张一份网格（正反面共用顶点）
  const grid = sheetGrid(W, H, COLS, ROWS, true); // 书是右装、镜像摆的（book3d.js）：uv 的 u 翻过来，字才是正的

  function makeTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = desk.renderer.capabilities.getMaxAnisotropy() >= 8 ? 8 : desk.renderer.capabilities.getMaxAnisotropy();
    return tex;
  }

  // 正反两面各贴一张纹理，背面透出少许正面的字（反过来也一样）：在着色器里把对面那张纹理取出来，按 10% 压在底色上。
  // 两面共用同一份纹理（不另造合成的画布）；背面的纹理在着色器里左右翻回来（从背面看，纸是镜像的）。
  // veil：扉页（第一张纸的正面）另有一张只有纸、没有字的底，书刚摊开时字还没浮现：body 管整页，title 管上面一块（命书、卷名）。
  function paperMaterial(map, through, side, veil) {
    const m = new THREE.MeshLambertMaterial({ map, side }); // 纸只有漫反射：标准材质的 4% 镜面反射会把灯光叠在字上，字就发褐发白
    m.customProgramCacheKey = () => `paper-${side === THREE.FrontSide ? 'front' : 'back'}${veil ? '-veil' : ''}`; // 着色器不同，不能共用一份编译结果
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uThrough = { value: through };
      let head = 'uniform sampler2D uThrough;\nvoid main() {';
      if (veil) {
        sh.uniforms.uVeil = { value: veil.tex };
        sh.uniforms.uBody = veil.body;
        sh.uniforms.uTitle = veil.title;
        head = 'uniform sampler2D uThrough;\nuniform sampler2D uVeil;\nuniform float uBody;\nuniform float uTitle;\nvoid main() {';
      }
      const sample = side === THREE.FrontSide
        ? 'texture2D( map, vMapUv ); vec3 th = texture2D( uThrough, vec2( 1.0 - vMapUv.x, vMapUv.y ) ).rgb;'
        : 'texture2D( map, vec2( 1.0 - vMapUv.x, vMapUv.y ) ); vec3 th = texture2D( uThrough, vMapUv ).rgb;';
      const veilMix = veil
        ? ' float inT = smoothstep( 0.40, 0.45, vMapUv.y ) * ( 1.0 - smoothstep( 0.93, 0.97, vMapUv.y ) ); sampledDiffuseColor = mix( texture2D( uVeil, vMapUv ), sampledDiffuseColor, mix( uBody, uTitle, inT ) );'
        : '';
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', head)
        .replace('#include <map_fragment>', `vec4 sampledDiffuseColor = ${sample}${veilMix}\n diffuseColor *= sampledDiffuseColor; diffuseColor.rgb *= mix( vec3( 1.0 ), th, 0.1 );`);
    };
    return m;
  }

  function buildSheet(i, c) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grid.base), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(grid.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(grid.index, 1));
    const ft = makeTexture(c.front);
    const bt = makeTexture(c.back);
    let veil = null;
    let vt = null;
    if (c.veil) {
      vt = makeTexture(c.veil);
      veil = { tex: vt, body: { get value() { return reveal.body; } }, title: { get value() { return reveal.title; } } };
    }
    const fm = paperMaterial(ft, bt, THREE.FrontSide, veil);
    const bm = paperMaterial(bt, ft, THREE.BackSide, null);
    fm.color.setScalar(tintK);
    bm.color.setScalar(tintK);
    mats.push(fm, bm);
    const fMesh = new THREE.Mesh(geo, fm);
    const bMesh = new THREE.Mesh(geo, bm);
    for (const m of [fMesh, bMesh]) { m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    return { i, geo, fMesh, bMesh, ft, bt, vt, fm, bm, out: new Float32Array(grid.base.length), st: { p: 0, v: 0 }, dy: 0 };
  }
  function dropSheet(s) {
    scene.remove(s.fMesh, s.bMesh);
    s.geo.dispose(); s.ft.dispose(); s.bt.dispose(); s.vt?.dispose();
    s.fm.dispose(); s.bm.dispose();
    const k = mats.indexOf(s.fm); if (k >= 0) mats.splice(k, 2);
  }

  const zR = (i) => z0r + (N - 1 - i) * T;
  const zL = (i) => z0l + i * T;

  function shape(sh) {
    bend(sh.out, grid.base, W, H, sh.st.p, { dy: sh.dy, zR: zR(sh.i), zL: zL(sh.i) });
    const pos = sh.geo.attributes.position;
    pos.array.set(sh.out);
    pos.needsUpdate = true;
    sh.geo.computeVertexNormals();
  }

  function restEdges() {
    const turned = sheets.filter((s) => s.st.p >= 1).length;
    const right = sheets.filter((s) => s.st.p <= 0);
    setEdges('R', right.length, z0r, right.length ? zR(right[0].i) : 0);
    const lefts = sheets.filter((s) => s.st.p >= 1);
    setEdges('L', turned, z0l, turned ? zL(lefts[lefts.length - 1].i) : 0);
  }

  function flags(sh, turning) {
    sh.fMesh.castShadow = sh.bMesh.castShadow = turning;
    sh.fMesh.receiveShadow = sh.bMesh.receiveShadow = !turning;
    sh.fMesh.renderOrder = sh.bMesh.renderOrder = turning ? 3 : 2;
  }

  // 夜里灯正照在书上，纸被照得过亮、字发褐发橙：纸的亮度压到 0.72，字才沉得下去（昼里不动）
  let tintK = 1;
  const tint = () => {
    const k = 1 - 0.28 * desk.themeT;
    if (Math.abs(k - tintK) < 1e-3) return;
    tintK = k;
    for (const m of mats) m.color.setScalar(k);
    for (const s of sheets) { s.fm.color.setScalar(k); s.bm.color.setScalar(k); }
  };
  desk.listeners.add(tint);

  /* ───────── 动起来：借桌子的渲染循环 ───────── */
  function request() {
    if (disposed) return;
    if (!ticking && active.size) {
      ticking = true;
      addTicker(tick);
    } else invalidate();
  }
  function tick(dt) {
    for (const [sh, a] of [...active]) {
      if (a.kind === 'spring') {
        const done = spring(sh.st, a.target, dt, a.opt);
        if (done) { sh.st.p = a.target; sh.st.v = 0; active.delete(sh); finish(sh, a); continue; }
      }
      sh.dy *= 1 - Math.min(1, dt * 3.5) * (a.kind === 'spring' ? 1 : 0);
      shape(sh);
    }
    if (!active.size) { ticking = false; return false; }
    return true;
  }
  function finish(sh, a) {
    flags(sh, false);
    sh.dy = 0;
    shape(sh);
    spreadNow = sheets.filter((s) => s.st.p >= 1).length;
    restEdges();
    a.resolve?.();
    api.onSpread?.(spreadNow);
    invalidate();
  }

  /* ───────── 对外 ───────── */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const pt = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const org = new THREE.Vector3();

  const api = {
    onSpread: null,
    reveal,
    get spread() { return spreadNow; },
    get sheets() { return N; },
    get limit() { return limit; },
    get busy() { return active.size > 0; },
    get count() { return sheets.length; },
    get list() { return sheets; }, // 调试用

    /** 设置全部纸的纹理画布：[{ front, back, veil? }]（Reader 画好的）；veil 是第一张纸正面的"只有纸"的底 */
    setSheets(list, lastSpread = list.length) {
      limit = lastSpread;
      for (const s of sheets) dropSheet(s);
      sheets.length = 0;
      active.clear();
      N = list.length;
      T = Math.max(1.2, Math.min(9, stack / Math.max(1, N)));
      list.forEach((c, i) => sheets.push(buildSheet(i, c)));
      // 纹理先上传到显卡（同步，会卡一下）：放在演出开始之前，别让第一帧在演出里卡住
      for (const s of sheets) for (const t of [s.ft, s.bt, s.vt]) if (t) desk.renderer.initTexture(t);
      for (const s of sheets) { s.st.p = s.i < spreadNow ? 1 : 0; flags(s, false); shape(s); }
      restEdges();
      invalidate();
    },
    /** 某一张纸的纹理画布内容变了（画布在原处重画过） */
    touch(i) {
      const s = sheets[i];
      if (!s) return;
      s.ft.needsUpdate = true;
      s.bt.needsUpdate = true;
      if (s.vt) s.vt.needsUpdate = true;
      invalidate();
    },
    setSpread(n) {
      spreadNow = Math.max(0, Math.min(N, n));
      active.clear();
      for (const s of sheets) { s.st.p = s.i < spreadNow ? 1 : 0; s.dy = 0; flags(s, false); shape(s); }
      restEdges();
      invalidate();
    },
    /** 屏幕上的一点 → 书页平面上的坐标 { x, y }（纸的局部坐标，一页宽 W） */
    toWorld(clientX, clientY) {
      const r = desk.rect;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
      raycaster.setFromCamera(ndc, desk.camera);
      scene.updateMatrixWorld(true);
      org.set(0, 0, z0r).applyMatrix4(scene.matrixWorld);
      nrm.set(0, 0, 1).transformDirection(scene.matrixWorld);
      plane.setFromNormalAndCoplanarPoint(nrm, org);
      if (!raycaster.ray.intersectPlane(plane, pt)) return { x: 0, y: 0 };
      scene.worldToLocal(pt);
      return { x: pt.x, y: pt.y };
    },
    /** 点击或键盘：往后（1）或往前（-1）翻一页，弹簧带着惯性，落下时回弹。返回 Promise */
    turn(dir, opt = { omega: 7.2, zeta: 0.74, bounce: 0.28 }) {
      if (active.size || (dir > 0 && spreadNow >= limit)) return Promise.resolve(false);
      const i = dir > 0 ? spreadNow : spreadNow - 1;
      const sh = sheets[i];
      if (!sh) return Promise.resolve(false);
      sh.st.p = dir > 0 ? 0 : 1;
      sh.st.v = 0;
      flags(sh, true);
      return new Promise((resolve) => {
        active.set(sh, { kind: 'spring', target: dir > 0 ? 1 : 0, opt, resolve: () => resolve(true) });
        request();
      });
    },
    /** 拖页角：side 'R' 从右页往后翻，'L' 从左页往前翻。返回手柄 { move(x, y), end() } 或 null */
    drag(side) {
      if (active.size || (side === 'R' && spreadNow >= limit)) return null;
      const i = side === 'R' ? spreadNow : spreadNow - 1;
      const sh = sheets[i];
      if (!sh) return null;
      sh.st.p = side === 'R' ? 0 : 1;
      flags(sh, true);
      const a = { kind: 'drag', target: 0 };
      active.set(sh, a);
      let t0 = performance.now();
      let p0 = sh.st.p;
      let v = 0;
      request();
      return {
        move(x, y) {
          const now = performance.now();
          const p = Math.min(1, Math.max(0, (W - x) / (2 * W)));
          const dt = (now - t0) / 1000;
          if (dt > 0.004) { v += ((p - p0) / dt - v) * 0.4; t0 = now; p0 = p; }
          sh.st.p = p;
          sh.st.v = v;
          sh.dy = Math.max(-1, Math.min(1, y / (H / 2)));
          request();
        },
        end() {
          const goOn = sh.st.p + sh.st.v * 0.16 > 0.5; // 过了中线，或者手是朝着翻过去的方向甩出去的
          a.kind = 'spring';
          a.target = goOn ? 1 : 0;
          a.opt = { omega: 11, zeta: 0.62, bounce: 0.28 };
          request();
        },
      };
    },
    /** 合上之前：所有翻到左边的纸一起翻回右边（很快），返回 Promise */
    collapse(ms = 320) {
      const moving = sheets.filter((s) => s.st.p > 0);
      if (!moving.length) return Promise.resolve();
      moving.forEach((s) => flags(s, true));
      const from = moving.map((s) => s.st.p);
      active.clear();
      return new Promise((resolve) => {
        let t = 0;
        addTicker((dt) => {
          t += dt * 1000;
          const u = Math.min(1, t / ms);
          moving.forEach((s, k) => {
            const lag = (k / moving.length) * 0.35; // 一张一张错开，像翻书页
            const e = smooth(Math.min(1, Math.max(0, (u - lag) / (1 - lag))));
            s.st.p = from[k] * (1 - e);
            s.dy = 0;
            shape(s);
          });
          if (u >= 1) {
            moving.forEach((s) => { s.st.p = 0; flags(s, false); shape(s); });
            spreadNow = 0;
            restEdges();
            api.onSpread?.(0);
            resolve();
            return false;
          }
          return true;
        });
      });
    },
    /** 清空（书合上之后） */
    clear() {
      for (const s of sheets) dropSheet(s);
      sheets.length = 0;
      active.clear();
      N = 0;
      spreadNow = 0;
      limit = 0;
      restEdges();
      invalidate();
    },
    dispose() {
      disposed = true;
      desk.listeners.delete(tint);
      api.clear();
      edgeMat.map.dispose();
      edgeMat.dispose();
      for (const k of ['R', 'L']) for (const m of edges[k]) { scene.remove(m); m.geometry.dispose(); }
    },
  };
  return api;
}
