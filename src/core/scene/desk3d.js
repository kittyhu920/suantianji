// 灯下的书桌（docs/DESIGN.md §5、§19）：一个 three.js 场景，一个 renderer，一套灯光。
//   桌子     旧漆木面（运行时画的木纹），桌沿有厚度与倒角；桌面之外是黑暗，案上的字盘（另一块常驻画布）在桌下透出来
//   灯       昼：窗光，偏冷、整体亮一档、阴影更软；夜：左上一盏暖灯，聚光，四周压暗。切换主题时平滑过渡
//   书与器物 book3d.js、pieces/*.js 往 desk.root 里放；每件器物只有这一套表现，首页、卷首、仪式中是同一个物件、不同的位姿
//   相机     55° 的三分之四俯视（桌上平放的书，字能读），随窗口自动框住桌子
//   渲染     只在有动静时画：invalidate() 请求一帧；动画靠 addTicker；页面不可见时停；静止时一帧不画；dpr ≤ 1.5
// three.js 只在这里（以及 book3d.js、pieces/*.js）用，由 Codex.svelte 动态 import。

import * as THREE from 'three';
import { paintWood, paintBlob, canvas } from './paint3d.js';
import { isDark, onTheme } from '../theme.js';

export const TABLE = { w: 112, d: 72, h: 3.4 }; // 厘米，桌面在 y = 0
export const ELEV = (55 * Math.PI) / 180;
const FOV = 28;
const DPR_MAX = 1.5;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// 两套光：t = 0 昼，t = 1 夜
const LIGHT = {
  day: {
    lamp: { i: 0, color: 0xffd9a8 },
    win: { i: 3.6, color: 0xdce8ff },
    hemi: { i: 1.5, sky: 0xdfe8f5, ground: 0x6a5a48 },
    exposure: 1.18,
    shadow: 11,
  },
  night: {
    lamp: { i: 135000, color: 0xffcc90 },
    win: { i: 0, color: 0xdce8ff },
    hemi: { i: 0.42, sky: 0x50607f, ground: 0x2e2012 },
    exposure: 1.0,
    shadow: 5,
  },
};

export async function createDesk(host, { onLost } = {}) {
  const canvasEl = document.createElement('canvas');
  canvasEl.className = 'desk-gl';
  host.prepend(canvasEl);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no webgl');
  } catch (e) {
    canvasEl.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 20, 900);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  /* ───────── 工具 ───────── */
  const tex = (cv, { srgb = true, repeat, wrap, aniso = maxAniso } = {}) => {
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    return t;
  };
  const shadowed = (obj, cast = true, receive = true) => {
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
    return obj;
  };
  const blobTex = tex(paintBlob(), {});
  /** 接触影：贴在桌面上的一块软影，w × d 厘米 */
  const blob = (w, d, opacity = 0.7) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, color: 0x000000 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, d, 1);
    m.position.y = 0.03;
    m.renderOrder = 1;
    m.userData.base = opacity;
    return m;
  };

  /* ───────── 灯 ───────── */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.3);
  scene.add(hemi);
  const lamp = new THREE.SpotLight(0xffb865, 0, 0, 0.82, 1, 2);
  lamp.position.set(-34, 64, 40);
  lamp.target.position.set(-2, 0, 4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 30;
  lamp.shadow.camera.far = 160;
  lamp.shadow.bias = -0.0005;
  lamp.shadow.normalBias = 0.05;
  lamp.shadow.blurSamples = 14;
  lamp.shadow.intensity = 0.82;
  scene.add(lamp, lamp.target);
  const win = new THREE.DirectionalLight(0xdce8ff, 0);
  win.position.set(-64, 78, 26);
  win.target.position.set(0, 0, -2);
  win.castShadow = true;
  win.shadow.mapSize.set(2048, 2048);
  Object.assign(win.shadow.camera, { left: -78, right: 78, top: 56, bottom: -56, near: 20, far: 220 });
  win.shadow.bias = -0.0004;
  win.shadow.normalBias = 0.05;
  win.shadow.blurSamples = 14;
  win.shadow.intensity = 0.7;
  scene.add(win, win.target);

  let themeT = isDark() ? 1 : 0; // 0 昼 1 夜
  let themeGoal = themeT;
  const col = new THREE.Color();
  function applyLight() {
    const D = LIGHT.day;
    const N = LIGHT.night;
    const t = themeT;
    lamp.intensity = lerp(D.lamp.i, N.lamp.i, t);
    lamp.color.set(N.lamp.color);
    win.intensity = lerp(D.win.i, N.win.i, t);
    win.color.set(D.win.color);
    hemi.intensity = lerp(D.hemi.i, N.hemi.i, t);
    hemi.color.copy(col.set(D.hemi.sky).lerp(new THREE.Color(N.hemi.sky), t));
    hemi.groundColor.copy(col.set(D.hemi.ground).lerp(new THREE.Color(N.hemi.ground), t));
    renderer.toneMappingExposure = lerp(D.exposure, N.exposure, t);
    const r = lerp(D.shadow, N.shadow, t);
    lamp.shadow.radius = r;
    win.shadow.radius = r;
    lamp.castShadow = t > 0.02;
    win.castShadow = t < 0.98;
    glow.material.opacity = lerp(0, 0.3, t);
  }

  /* ───────── 桌子 ───────── */
  const wood = paintWood({ w: 1024, h: 704 });
  const woodMap = tex(wood.color, { wrap: true });
  const woodBump = tex(wood.bump, { srgb: false, wrap: true });
  const woodRough = tex(wood.rough, { srgb: false, wrap: true });
  const deskMat = new THREE.MeshPhysicalMaterial({
    map: woodMap, bumpMap: woodBump, bumpScale: 0.35, roughnessMap: woodRough, roughness: 1, metalness: 0,
    clearcoat: 0.32, clearcoatRoughness: 0.36,
  });
  const edgeMat = new THREE.MeshStandardMaterial({ map: woodMap, color: 0x7a6a5a, roughness: 0.75 });
  const table = (() => {
    const { w, d, h } = TABLE;
    const r = 3.2;
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -d / 2);
    sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    sh.lineTo(-w / 2 + r, d / 2); sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h - 1, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.55, bevelSegments: 3, curveSegments: 8 });
    geo.rotateX(-Math.PI / 2); // 形在 XZ 平面（y 向 -z），厚度沿 +y
    geo.translate(0, -h + 0.5, 0);
    // 顶面的 uv 按桌面坐标铺；侧面取一条长纹
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const up = nor.getY(i) > 0.55;
      if (up) uv.setXY(i, (pos.getX(i) + w / 2) / w, 1 - (pos.getZ(i) + d / 2) / d);
      else uv.setXY(i, ((pos.getX(i) + pos.getZ(i)) * 0.012) % 1, 0.5 + pos.getY(i) * 0.02);
    }
    const m = new THREE.Mesh(geo, [deskMat, edgeMat]);
    m.receiveShadow = true;
    m.castShadow = true;
    return m;
  })();
  root.add(table);
  // 桌子在案（字盘）上投的一圈软影；桌面之外就是黑暗
  const under = (() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.95, depthWrite: false, color: 0x000000 }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(TABLE.w * 1.28, TABLE.d * 1.4, 1);
    m.position.set(0, -TABLE.h - 0.2, 4);
    return m;
  })();
  root.add(under);
  // 夜里灯下一片暖光的晕（只叠在桌面上，让光池更有层次）
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0, depthWrite: false, color: 0xffa24a, blending: THREE.AdditiveBlending }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.scale.set(80, 54, 1);
  glow.position.set(-4, 0.04, -3);
  glow.renderOrder = 0;
  root.add(glow);

  /* ───────── 相机：框住桌子；读命书时平滑推近到读书的机位 ───────── */
  const target = new THREE.Vector3(0, 0, 2);
  const corners = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { corners.push(new THREE.Vector3(sx * TABLE.w / 2, 0, sz * TABLE.d / 2)); corners.push(new THREE.Vector3(sx * TABLE.w / 2, -TABLE.h, sz * TABLE.d / 2)); }
  let W = 1;
  let H = 1;
  let distance = 150;
  const tanH = () => Math.tan((FOV * Math.PI) / 360);
  const place = (tg, dist, elev) => {
    camera.position.set(tg.x, tg.y + dist * Math.sin(elev), tg.z + dist * Math.cos(elev));
    camera.lookAt(tg);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };
  /** 让一组世界点落进画面里的一块（NDC：x 在 ±band.x 内，y 在 band.ylo..band.yhi 内）：调距离与注视点 */
  function frame(pts, elev, band, tg, dist) {
    const t = tg.clone();
    for (let k = 0; k < 16; k++) {
      place(t, dist, elev);
      let xmax = 0;
      let ymax = -9;
      let ymin = 9;
      for (const c of pts) {
        const p = c.clone().project(camera);
        xmax = Math.max(xmax, Math.abs(p.x));
        ymax = Math.max(ymax, p.y);
        ymin = Math.min(ymin, p.y);
      }
      const need = Math.max(xmax / band.x, (ymax - ymin) / (band.yhi - band.ylo));
      dist *= lerp(1, need, 0.8);
      const mid = (ymax + ymin) / 2 - (band.yhi + band.ylo) / 2;
      t.z -= ((mid * dist * tanH()) / Math.sin(elev)) * 0.8;
    }
    return { tg: t, dist };
  }
  // 读命书的机位：书摊开在桌子中央，机位比看桌子时更陡、更近（由 book3d 给出摊开的书占的几个点）
  const cam = { k: 0, goal: 0, rd: null, ticker: null };
  const READ = { elev: (63 * Math.PI) / 180, band: { x: 0.9, ylo: -0.6, yhi: 0.84 } };
  function applyCam() {
    const k = cam.k;
    if (!cam.rd || k <= 0) { place(target, distance, ELEV); return; }
    const rd = cam.rd;
    const tg = new THREE.Vector3().lerpVectors(target, rd.tg, k);
    place(tg, lerp(distance, rd.dist, k), lerp(ELEV, rd.elev, k));
  }
  function fit() {
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = FOV;
    const r = frame(corners, ELEV, { x: 0.985, ylo: -0.97, yhi: 0.97 }, target, distance);
    target.copy(r.tg);
    distance = r.dist;
    cam.rd = null;
    const pts = desk.readingPts?.();
    if (pts) {
      const rr = frame(pts, READ.elev, READ.band, new THREE.Vector3(0, 0, 0), distance * 0.7);
      cam.rd = { tg: rr.tg, dist: rr.dist, elev: READ.elev };
    }
    applyCam();
    view.version++;
    invalidate();
  }
  /** 相机走到某个机位：'table' 看桌子，'reading' 读命书。ms 毫秒、缓入缓出；instant 直接到位 */
  function cameraTo(mode, ms = 1100, instant = false) {
    cam.goal = mode === 'reading' ? 1 : 0;
    if (!cam.rd) cam.goal = 0;
    cam.ticker?.();
    cam.ticker = null;
    if (instant || ms <= 0) { cam.k = cam.goal; applyCam(); view.version++; invalidate(); return; }
    const from = cam.k;
    let t = 0;
    cam.ticker = addTicker((dt) => {
      t += dt * 1000;
      const u = Math.min(1, t / ms);
      const e = u * u * (3 - 2 * u);
      cam.k = lerp(from, cam.goal, e);
      applyCam();
      view.version++;
      if (u >= 1) { cam.ticker = null; return false; }
      return true;
    });
  }

  /** 世界点 → 画布上的 CSS 像素 */
  const tmp = new THREE.Vector3();
  function project(v) {
    tmp.copy(v).project(camera);
    return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H };
  }
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** 画布上的一点（CSS 像素，相对画布左上角）→ 桌面（y = 0）上的点 */
  function floorAt(px, py, y = 0) {
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    floorPlane.constant = -y;
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(floorPlane, out) ? out : null;
  }
  const view = { version: 0 }; // 相机动了（窗口大小变了）就加一，书的话那张纸笺按它重算位置

  /* ───────── 渲染循环：只在有动静时才跑 ───────── */
  const tickers = new Set();
  const listeners = new Set(); // 每画一帧之后回调（书的话重新定位等）
  let raf = 0;
  let dirty = true;
  let last = 0;
  let disposed = false;
  let lastFrameAt = 0;
  const stats = { frames: 0, idleFrames: 0, since: performance.now(), ms: [] };

  function renderNow() {
    renderer.shadowMap.needsUpdate = true;
    const t0 = performance.now();
    renderer.render(scene, camera);
    stats.frames++;
    stats.ms.push(performance.now() - t0);
    if (stats.ms.length > 240) stats.ms.shift();
    dirty = false;
    lastFrameAt = performance.now();
    for (const f of listeners) f();
  }
  function tick(now) {
    raf = 0;
    if (disposed || document.hidden) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    for (const f of [...tickers]) if (f(dt) === false) tickers.delete(f);
    if (dirty || tickers.size) renderNow();
    if (tickers.size || dirty) raf = requestAnimationFrame(tick);
    else last = 0;
  }
  function invalidate() {
    dirty = true;
    if (!raf && !disposed) raf = requestAnimationFrame(tick);
  }
  /** 加一个每帧回调：返回 false 即停；回调在跑的时候每帧都画 */
  function addTicker(f) {
    tickers.add(f);
    if (!raf && !disposed) { last = 0; raf = requestAnimationFrame(tick); }
    return () => tickers.delete(f);
  }
  /** 立刻画一帧（物理在自己的 rAF 里推进，推进完直接画，不再等下一帧） */
  function frameNow() {
    if (disposed || document.hidden) return;
    if (performance.now() - lastFrameAt < 4) return;
    renderNow();
  }
  const onVis = () => { if (!document.hidden) invalidate(); };
  document.addEventListener('visibilitychange', onVis);

  /* ───────── 主题 ───────── */
  let themeTicker = null;
  function goTheme(dark, instant = false) {
    themeGoal = dark ? 1 : 0;
    if (instant) { themeT = themeGoal; applyLight(); invalidate(); return; }
    if (themeTicker) return;
    themeTicker = addTicker((dt) => {
      const d = themeGoal - themeT;
      themeT += Math.sign(d) * Math.min(Math.abs(d), dt / 0.9);
      applyLight();
      if (Math.abs(themeGoal - themeT) < 1e-3) { themeT = themeGoal; applyLight(); themeTicker = null; return false; }
      return true;
    });
  }
  const offTheme = onTheme((t) => goTheme(t === 'dark'));

  /* ───────── 位姿：平滑逼近目标 ───────── */
  // pose = { x, y, z, ry, s }：目标改了就让它指数逼近；到位即停
  function poser(obj, init) {
    const P = { x: 0, y: 0, z: 0, ry: 0, s: 1, ...init };
    const T = { ...P };
    let rate = 7;
    let stop = null;
    const apply = () => { obj.position.set(P.x, P.y, P.z); obj.rotation.y = P.ry; obj.scale.setScalar(Math.max(P.s, 0.0001)); };
    apply();
    const step = (dt) => {
      const k = 1 - Math.exp(-rate * dt);
      let more = false;
      for (const key of ['x', 'y', 'z', 'ry', 's']) {
        const dv = T[key] - P[key];
        if (Math.abs(dv) > (key === 'ry' ? 0.0008 : 0.004)) { P[key] += dv * k; more = true; } else P[key] = T[key];
      }
      apply();
      api.onMove?.();
      return more;
    };
    const api = {
      P, T,
      to(next, r = 7, instant = false) {
        Object.assign(T, next);
        rate = r;
        if (instant) { Object.assign(P, T); apply(); invalidate(); return; }
        if (!stop && ['x', 'y', 'z', 'ry', 's'].every((k) => Math.abs(T[k] - P[k]) < 0.004)) return;
        if (!stop) stop = addTicker((dt) => { const m = step(dt); if (!m) { stop = null; return false; } return true; });
      },
      get moving() { return !!stop; },
      onMove: null,
    };
    return api;
  }

  /* ───────── 拾取 ───────── */
  const hitTargets = []; // { mesh, owner, tag }
  function register(mesh, owner, tag) { mesh.userData.owner = owner; mesh.userData.tag = tag; hitTargets.push(mesh); }
  function unregister(mesh) { const i = hitTargets.indexOf(mesh); if (i >= 0) hitTargets.splice(i, 1); }
  function pick(clientX, clientY, filter) {
    const r = canvasEl.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const list = filter ? hitTargets.filter(filter) : hitTargets;
    const hits = ray.intersectObjects(list, false);
    for (const h of hits) if (h.object.parent && isVisible(h.object)) return h;
    return null;
  }
  function isVisible(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }

  const desk = {
    THREE, scene, root, camera, renderer, canvas: canvasEl, host,
    TABLE, tex, shadowed, blob, poser, paintCanvas: canvas,
    invalidate, addTicker, frameNow, project, floorAt, pick, register, unregister,
    view, listeners, stats, cameraTo,
    readingPts: null, // 由 book3d 填：摊开的书占的几个世界点（读命书的机位据此框画面）
    get camReading() { return cam.k; },
    get themeT() { return themeT; }, // 0 昼 1 夜（切换时在 0.9 秒里平滑变）
    get size() { return { w: W, h: H }; },
    get rect() { return canvasEl.getBoundingClientRect(); },
    setTheme: goTheme,
    fit,
    // 之后由 book3d / pieces 填入
    book: null,
    pieces: {},
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
      offTheme();
      ro.disconnect();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvasEl.remove();
    },
    perf() {
      const a = [...stats.ms];
      a.sort((x, y) => x - y);
      return { frames: stats.frames, medianMs: a[a.length >> 1] ?? 0, p95Ms: a[Math.floor(a.length * 0.95)] ?? 0 };
    },
  };

  canvasEl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost?.(); });
  const ro = new ResizeObserver(() => fit());
  ro.observe(host);
  applyLight();
  fit();
  return desk;
}
