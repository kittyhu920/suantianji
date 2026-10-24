// 命书的 WebGL 场景（docs/DESIGN.md §19）：一本摊开的线装书，每张纸是一个细分的平面网格，翻页时按拖动点做圆柱/锥面卷曲（curl.js），
// 正反两面各贴一张 Canvas 画的纹理（背面隐约透出正面的字，合成在纹理里），光照与投影用真实的灯与影（翻起的纸投在下面的书页与桌上）。
// 只在需要时才渲染：静止时一帧不画；翻页时每帧只重算正在翻的那一张纸的顶点与法线，不重画任何纹理。
// three.js 只在这里动态 import（独立的一块，不进首屏）。

import { sheetGrid, bend, spring } from './curl.js';

const W = 500; // 页宽、页高（世界单位；页的宽高比与纹理的 5:7 一致）
const H = 700;
const COLS = 40;
const ROWS = 14;
const T = 1.5; // 一张纸的厚度（层与层之间的间隔）
const Z0 = 7; // 第一张纸离桌面的高度

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

export async function createBookGL(canvas, { onSpread, onSettle } = {}) {
  const THREE = await import('three');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no webgl');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const FOV = 26;
  const TILT = (22 * Math.PI) / 180;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 50, 6000);
  const target = new THREE.Vector3(0, 18, 0);

  // 灯：左上前方一盏暖灯，翻起的纸在下面的书页与桌上投影
  scene.add(new THREE.AmbientLight(0xffffff, 0.92));
  const sun = new THREE.DirectionalLight(0xffe7c2, 1.05);
  sun.position.set(-520, 560, 900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -820, right: 820, top: 820, bottom: -820, near: 200, far: 2600 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.5;
  sun.shadow.radius = 3.5;
  scene.add(sun);

  // 桌面只接影子
  const shadowTable = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.ShadowMaterial({ opacity: 0.5 }));
  shadowTable.position.z = -6.5;
  shadowTable.receiveShadow = true;
  scene.add(shadowTable);

  // 封面（深靛布面）：左右两块板与书脊，书页夹在中间；板的内面是一层旧纸色的衬页
  const clothMat = new THREE.MeshLambertMaterial({ color: 0x2f3b53 });
  const board = (x, w) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H + 16, 6), clothMat);
    m.position.set(x, 0, -3);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  board(W / 2 + 2, W + 14);
  board(-W / 2 - 2, W + 14);
  board(0, 18);
  const endMat = new THREE.MeshLambertMaterial({ color: 0xc9b98f });
  for (const x of [W / 2, -W / 2]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), endMat);
    m.position.set(x, 0, 0.3);
    m.receiveShadow = true;
    scene.add(m);
  }

  // 纸边：左右两叠各三面（书口与上下沿），高度随这一叠的纸数变
  const edgeMat = new THREE.MeshLambertMaterial({ map: edgeTexture(THREE) });
  const edges = { R: [], L: [] };
  for (const side of ['R', 'L']) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), edgeMat);
      m.receiveShadow = true;
      scene.add(m);
      edges[side].push(m);
    }
  }
  const setEdges = (side, count, topZ) => {
    const [out, bot, top] = edges[side];
    const h = Math.max(0.01, count ? topZ + 1 : 0.01);
    const zc = h / 2 - 1;
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
  const grid = sheetGrid(W, H, COLS, ROWS);
  const sheets = [];
  let N = 0;
  let spreadNow = 0;
  let limit = 0; // 最多翻到第几个对页（最后一页真正的内容露出来为止，后面的空白不翻）
  const mats = [];

  function makeTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  // 正反两面各贴一张纹理，背面透出少许正面的字（反过来也一样）：在着色器里把对面那张纹理取出来，按 10% 压在底色上。
  // 两面共用同一份纹理（不另造合成的画布）；背面的纹理在着色器里左右翻回来（从背面看，纸是镜像的）。
  function paperMaterial(map, through, side) {
    const m = new THREE.MeshLambertMaterial({ map, side });
    m.customProgramCacheKey = () => (side === THREE.FrontSide ? 'paper-front' : 'paper-back'); // 两面的着色器不同，不能共用一份编译结果
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uThrough = { value: through };
      const sample = side === THREE.FrontSide
        ? 'texture2D( map, vMapUv ); vec3 th = texture2D( uThrough, vec2( 1.0 - vMapUv.x, vMapUv.y ) ).rgb;'
        : 'texture2D( map, vec2( 1.0 - vMapUv.x, vMapUv.y ) ); vec3 th = texture2D( uThrough, vMapUv ).rgb;';
      sh.fragmentShader = sh.fragmentShader
        .replace('void main() {', 'uniform sampler2D uThrough;\nvoid main() {')
        .replace('#include <map_fragment>', `vec4 sampledDiffuseColor = ${sample}\n diffuseColor *= sampledDiffuseColor; diffuseColor.rgb *= mix( vec3( 1.0 ), th, 0.1 );`);
    };
    return m;
  }

  function buildSheet(i, front, back) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(grid.base), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(grid.uv, 2));
    geo.setIndex(new THREE.BufferAttribute(grid.index, 1));
    const ft = makeTexture(front);
    const bt = makeTexture(back);
    const fm = paperMaterial(ft, bt, THREE.FrontSide);
    const bm = paperMaterial(bt, ft, THREE.BackSide);
    mats.push(fm, bm);
    const fMesh = new THREE.Mesh(geo, fm);
    const bMesh = new THREE.Mesh(geo, bm);
    for (const m of [fMesh, bMesh]) { m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    const sh = { i, geo, fMesh, bMesh, ft, bt, out: new Float32Array(grid.base.length), st: { p: 0, v: 0 }, dy: 0 };
    return sh;
  }

  const zR = (i) => Z0 + (N - 1 - i) * T;
  const zL = (i) => Z0 + i * T;

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
    setEdges('R', right.length, right.length ? zR(right[0].i) : 0);
    const lefts = sheets.filter((s) => s.st.p >= 1);
    setEdges('L', turned, turned ? zL(lefts[lefts.length - 1].i) : 0);
  }

  function flags(sh, turning) {
    sh.fMesh.castShadow = sh.bMesh.castShadow = turning;
    sh.fMesh.receiveShadow = sh.bMesh.receiveShadow = !turning;
    sh.fMesh.renderOrder = sh.bMesh.renderOrder = turning ? 1 : 0;
  }

  /* ───────── 渲染循环：只在有动静时才跑 ───────── */
  let raf = 0;
  let last = 0;
  let disposed = false;
  const active = new Map(); // sheet -> { target, kind: 'spring' | 'drag' }

  function render() {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function request() {
    if (raf || disposed) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const [sh, a] of [...active]) {
      if (a.kind === 'spring') {
        const done = spring(sh.st, a.target, dt, a.opt);
        if (done) { sh.st.p = a.target; sh.st.v = 0; active.delete(sh); finish(sh, a); }
      }
      sh.dy *= 1 - Math.min(1, dt * 3.5) * (a.kind === 'spring' ? 1 : 0);
      shape(sh);
    }
    render();
    if (active.size) raf = requestAnimationFrame(tick);
  }
  function finish(sh, a) {
    flags(sh, false);
    sh.dy = 0;
    shape(sh);
    spreadNow = sheets.filter((s) => s.st.p >= 1).length;
    restEdges();
    a.resolve?.();
    onSpread?.(spreadNow);
    onSettle?.();
  }

  /* ───────── 对外 ───────── */
  const api = {
    get spread() { return spreadNow; },
    get sheets() { return N; },
    get limit() { return limit; },
    get busy() { return active.size > 0; },

    /** 设置全部纸的纹理画布：[{ front, back }]（Reader 画好的） */
    setSheets(list, lastSpread = list.length) {
      limit = lastSpread;
      for (const s of sheets) { scene.remove(s.fMesh, s.bMesh); s.geo.dispose(); s.ft.dispose(); s.bt.dispose(); }
      sheets.length = 0;
      N = list.length;
      list.forEach((c, i) => sheets.push(buildSheet(i, c.front, c.back)));
      for (const s of sheets) { s.st.p = s.i < spreadNow ? 1 : 0; flags(s, false); shape(s); }
      restEdges();
      request();
    },
    /** 某一张纸的纹理画布内容变了（画布在原处重画过） */
    touch(i) {
      const s = sheets[i];
      if (!s) return;
      s.ft.needsUpdate = true;
      s.bt.needsUpdate = true;
      request();
    },
    setSpread(n) {
      spreadNow = Math.max(0, Math.min(N, n));
      for (const s of sheets) { s.st.p = s.i < spreadNow ? 1 : 0; shape(s); }
      restEdges();
      request();
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      const t = Math.tan((FOV * Math.PI) / 360);
      const dist = Math.max((H / 2 + 56) / t, (W + 52) / (t * camera.aspect)) * 1.06;
      camera.position.set(0, target.y - dist * Math.sin(TILT), dist * Math.cos(TILT));
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      request();
    },
    /** 屏幕上的一点 → 书页平面（z = 页面高度）上的坐标 { x, y }；平面是 z=Z0 附近 */
    toWorld(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const pt = new THREE.Vector3();
      ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z0), pt);
      return pt ? { x: pt.x, y: pt.y } : { x: 0, y: 0 };
    },
    /** 点击或键盘：往后（1）或往前（-1）翻一页，弹簧带着惯性，落下时回弹。返回 Promise */
    turn(dir) {
      if (active.size || (dir > 0 && spreadNow >= limit)) return Promise.resolve(false);
      const i = dir > 0 ? spreadNow : spreadNow - 1;
      const sh = sheets[i];
      if (!sh) return Promise.resolve(false);
      sh.st.p = dir > 0 ? 0 : 1;
      sh.st.v = 0;
      flags(sh, true);
      return new Promise((resolve) => {
        active.set(sh, { kind: 'spring', target: dir > 0 ? 1 : 0, opt: { omega: 7.2, zeta: 0.74, bounce: 0.28 }, resolve: () => resolve(true) });
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
    render() { request(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      for (const s of sheets) { s.geo.dispose(); s.ft.dispose(); s.bt.dispose(); }
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss?.();
    },
  };
  return api;
}
