// 3D 铅字字盘（docs/DESIGN.md §18）：取代 2D 字盘。three.js，按需动态 import。
//
// 一盘有厚度的金属活字：整盘只有一个 InstancedMesh（一份盒子几何、几千个实例），字形来自一张 Canvas 画的反字图集；
// 字面的凸起用图集的高度做法线（着色器里对图集取差分），边缘的倒角在着色器里弯折法线，所以不为每个字单独建几何体。
//   鼠标移过：附近几块活字微微抬起（高度按距离衰减、每块略有差别）；
//   点一下：那一块按下去，原地"拓"出朱印（阴文正字）、洇开一团墨晕（ink.js，由 board.js 传进来）；
//   整盘缓慢向上滚；悬停整盘暂停；页面不可见时停止渲染；静止时停帧。
//
// 渲染节奏：有交互动画（抬起、按下）时跟随 rAF；只有漂移（滚动）时降到约 20 帧；
// 只剩朱印淡出时约 30 帧；什么都不动时一帧不画。dpr 上限 1.5。

import {
  WebGLRenderer, PerspectiveCamera, Scene, InstancedMesh, BoxGeometry, ShaderMaterial, InstancedBufferAttribute,
  BufferAttribute, CanvasTexture, LinearFilter, LinearMipmapLinearFilter, Vector3, Vector2, Matrix4, Raycaster, Plane,
  DynamicDrawUsage,
} from 'three';
import { isDark, onTheme } from '../theme.js';
import { uniqueChars, buildAtlas, cellUv } from './atlas.js';

const TILE = 40; // 屏幕中央一块字大约多少像素
const FOV = 28;
const TILT = 0.66; // 机位自正上方向前倾的弧度（约 38°）
const SPEED = 0.24; // 滚动：每秒多少格（与 2D 字盘约 9px/s 相当）
const PITCH = 1;
const W_TILE = 0.94;
const LIFT = 0.62;
const LIFT_R = 3.4;
const MAX_STAMPS = 8;
const DPR_MAX = 1.5;
const LIGHT = [-0.55, -0.15, 0.82];

// 两套配色（着色器里的颜色是直接写进帧缓冲的 sRGB 值，不走色彩管理）
const PALETTE = {
  light: { // 旧木盒里的铅字：灰褐的金属，暖光
    body: [0.135, 0.125, 0.110], glyph: [0.33, 0.31, 0.275], gold: [0.33, 0.31, 0.275],
    light: [0.96, 0.88, 0.74], amb: [0.26, 0.24, 0.21], spec: 0.5, goldOn: 0, fog: [0.07, 0.06, 0.05],
  },
  dark: { // 墨底：铅字泛冷光，偶见泥金
    body: [0.045, 0.050, 0.060], glyph: [0.26, 0.31, 0.39], gold: [0.70, 0.54, 0.25],
    light: [0.72, 0.84, 1.0], amb: [0.22, 0.24, 0.28], spec: 0.75, goldOn: 1, fog: [0.02, 0.02, 0.025],
  },
};

const VERT = /* glsl */`
  attribute vec4 aCell;   // 图集里这个字的 uv：xy 起点，zw 宽高
  attribute vec4 aState;  // x 抬起量，y 朱印浓度，z 明暗差，w 泥金标记
  attribute float aTop;   // 几何自带：1 为顶面
  varying vec2 vFace;
  varying vec2 vAtlas;
  varying float vTop;
  varying vec3 vN;
  varying vec3 vW;
  varying vec4 vState;
  varying vec4 vCell;
  varying float vDepth;
  void main() {
    vec3 p = position;
    p.z += aState.x;
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vN = mat3(modelMatrix) * mat3(instanceMatrix) * normal;
    vW = wp.xyz;
    vFace = uv;
    vAtlas = aCell.xy + uv * aCell.zw;
    vCell = aCell;
    vTop = aTop;
    vState = aState;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uAtlas;
  uniform vec2 uTexel;
  uniform vec3 uLight;
  uniform vec3 uLightCol;
  uniform vec3 uAmb;
  uniform vec3 uBody;
  uniform vec3 uGlyph;
  uniform vec3 uGold;
  uniform vec3 uFog;
  uniform vec3 uCam;
  uniform float uSpec;
  uniform float uGoldOn;
  uniform float uFar;
  varying vec2 vFace;
  varying vec2 vAtlas;
  varying float vTop;
  varying vec3 vN;
  varying vec3 vW;
  varying vec4 vState;
  varying vec4 vCell;
  varying float vDepth;

  float hgt(vec2 uv) { return texture2D(uAtlas, uv).r; }

  void main() {
    vec3 L = normalize(uLight);
    vec3 V = normalize(uCam - vW);
    vec3 col;
    if (vTop > 0.5) {
      float h = hgt(vAtlas);
      float e = 1.3;
      float hx = hgt(vAtlas + vec2(uTexel.x * e, 0.0)) - hgt(vAtlas - vec2(uTexel.x * e, 0.0));
      float hy = hgt(vAtlas + vec2(0.0, uTexel.y * e)) - hgt(vAtlas - vec2(0.0, uTexel.y * e));
      vec3 n = normalize(vec3(-hx * 1.7, -hy * 1.7, 1.0));

      // 倒角：靠近四边的一圈把法线朝外弯，受光的边就亮成一道线
      vec2 f = vFace;
      vec2 d = min(f, 1.0 - f);
      float bx = 1.0 - smoothstep(0.0, 0.075, d.x);
      float by = 1.0 - smoothstep(0.0, 0.075, d.y);
      vec2 dir = vec2(f.x < 0.5 ? -1.0 : 1.0, f.y < 0.5 ? -1.0 : 1.0);
      n = normalize(n + vec3(dir.x * bx, dir.y * by, 0.0) * 1.25);
      float edge = max(bx, by);

      float mask = smoothstep(0.25, 0.75, h);
      vec3 glyphCol = mix(uGlyph, uGold, step(0.5, vState.w) * uGoldOn);
      vec3 albedo = mix(uBody, glyphCol, mask) * (0.9 + 0.2 * vState.z);

      float diff = max(dot(n, L), 0.0);
      vec3 H = normalize(L + V);
      float shin = mix(18.0, 60.0, mask);
      float sp = pow(max(dot(n, H), 0.0), shin) * (0.35 + 0.9 * mask + 1.1 * edge) * uSpec;
      col = albedo * (uAmb + uLightCol * diff) + uLightCol * sp;
      // 抬起的块更亮一点（离光近），按下去的更暗
      col *= 1.0 + vState.x * 0.45;

      // 朱印：阴文正字。把图集的反字沿 x 翻回来，字的地方留纸色，其余是朱
      if (vState.y > 0.001) {
        vec2 fl = vCell.xy + vec2(1.0 - vFace.x, vFace.y) * vCell.zw;
        float m2 = smoothstep(0.3, 0.7, hgt(fl));
        vec2 inner = smoothstep(0.045, 0.085, d);
        float box = inner.x * inner.y;
        vec3 red = vec3(0.70, 0.15, 0.12) * (0.55 + 0.7 * diff) + uLightCol * sp * 0.25;
        vec3 paper = vec3(0.95, 0.91, 0.82) * (0.7 + 0.4 * diff);
        vec3 stamp = mix(red, paper, m2 * 0.92);
        col = mix(col, stamp, vState.y * box);
      }
    } else {
      vec3 n = normalize(vN);
      float diff = max(dot(n, L), 0.0);
      col = uBody * 0.8 * (uAmb + uLightCol * diff * 0.8);
    }
    float fog = smoothstep(uFar * 0.78, uFar * 1.18, vDepth);
    col = mix(col, uFog, fog * 0.7);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const hash = (n) => {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * @param {HTMLElement} board  案（#an-board）
 * @param {{ chars: string[], wash: (x:number,y:number)=>void, debug?: boolean }} opt
 * @returns {Promise<{ destroy(): void, stats(): object }>}
 */
export async function createBoard3D(board, { chars, wash, debug = false }) {
  const { list, index } = uniqueChars(chars);
  const seqChars = chars.filter((c) => index.has(c));
  const { canvas: atlasCv, side } = buildAtlas(list);

  const canvas = document.createElement('canvas');
  canvas.className = 'zp-gl';
  board.prepend(canvas);

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) {
    canvas.remove();
    throw e;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_MAX));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 1, 400);
  const camPos = new Vector3();

  const atlas = new CanvasTexture(atlasCv);
  atlas.minFilter = LinearMipmapLinearFilter;
  atlas.magFilter = LinearFilter;
  atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  const uniforms = {
    uAtlas: { value: atlas },
    uTexel: { value: new Vector2(1 / atlasCv.width, 1 / atlasCv.height) },
    uLight: { value: new Vector3(...LIGHT) },
    uLightCol: { value: new Vector3() },
    uAmb: { value: new Vector3() },
    uBody: { value: new Vector3() },
    uGlyph: { value: new Vector3() },
    uGold: { value: new Vector3() },
    uFog: { value: new Vector3() },
    uCam: { value: camPos },
    uSpec: { value: 0.6 },
    uGoldOn: { value: 0 },
    uFar: { value: 60 },
  };
  const material = new ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });

  // ───────── 网格：一次建好，只在尺寸要求更大时重建 ─────────
  let cols = 0;
  let rows = 0;
  let mesh = null;
  let geo = null;
  let attrCell;
  let attrState;
  let glyphIdx; // 每块的字：图集序号，-1 为空铅
  let lift;     // 当前抬起量
  let tone;
  let gold;
  let stampAge;
  let pressAge;
  let seq = 0;
  let scroll = 0;
  let curRow = 0;
  const active = new Set();   // 抬起量不为 0 的块
  const stamps = new Set();   // 正在显示朱印的块
  const presses = new Set();  // 正在被按下的块
  let hoverCol = -1;
  let hoverRow = -1;
  let hovering = false;

  const rowFill = (r) => {
    const base = seq;
    seq += cols;
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const n = base + (cols - 1 - c); // 整盘是版面的反面：行内次序自右向左
      const blank = hash(n * 7 + 3) < 0.05;
      glyphIdx[i] = blank || !seqChars.length ? -1 : index.get(seqChars[n % seqChars.length]);
      tone[i] = hash(n * 13 + 5);
      gold[i] = hash(n * 29 + 11) < 0.045 ? 1 : 0;
    }
  };

  function writeAttrs(from = 0, to = cols * rows) {
    const cellA = attrCell.array;
    const st = attrState.array;
    for (let i = from; i < to; i++) {
      const gi = glyphIdx[i];
      const [u, v, du, dv] = gi >= 0 ? cellUv(gi, side) : [0, 0, 0, 0];
      cellA[i * 4] = u; cellA[i * 4 + 1] = v; cellA[i * 4 + 2] = du; cellA[i * 4 + 3] = dv;
      st[i * 4] = lift[i] + pressOffset(i);
      st[i * 4 + 1] = stampAmt(i);
      st[i * 4 + 2] = tone[i];
      st[i * 4 + 3] = gold[i];
    }
    attrCell.needsUpdate = true;
    attrState.needsUpdate = true;
  }

  const pressOffset = (i) => {
    if (!presses.has(i)) return 0;
    const a = pressAge[i];
    return a < 0.08 ? (-0.34 * a) / 0.08 : -0.34 * Math.exp(-(a - 0.08) * 6);
  };
  const stampAmt = (i) => {
    if (!stamps.has(i)) return 0;
    const a = stampAge[i];
    if (a < 0.12) return (a / 0.12) * 0.92;
    if (a < 5) return 0.92;
    return Math.max(0, 0.92 * (1 - (a - 5) / 1.6));
  };

  function build(c, r) {
    if (mesh) { scene.remove(mesh); mesh.dispose(); geo.dispose(); }
    cols = c; rows = r;
    const n = cols * rows;
    geo = new BoxGeometry(W_TILE, W_TILE, 1);
    geo.translate(0, 0, -0.5); // 顶面在 z = 0，厚度向下
    const top = new Float32Array(geo.attributes.position.count);
    top.fill(0, 0);
    for (let k = 16; k < 20; k++) top[k] = 1; // BoxGeometry 的顶面（+z）是第五个面
    geo.setAttribute('aTop', new BufferAttribute(top, 1));
    attrCell = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    attrState = new InstancedBufferAttribute(new Float32Array(n * 4), 4);
    attrCell.setUsage(DynamicDrawUsage);
    attrState.setUsage(DynamicDrawUsage);
    geo.setAttribute('aCell', attrCell);
    geo.setAttribute('aState', attrState);
    mesh = new InstancedMesh(geo, material, n);
    mesh.frustumCulled = false;
    const m = new Matrix4();
    for (let rr = 0; rr < rows; rr++) {
      for (let cc = 0; cc < cols; cc++) {
        m.makeTranslation((cc - cols / 2 + 0.5) * PITCH, (rr - rows / 2 + 0.5) * PITCH, 0);
        mesh.setMatrixAt(rr * cols + cc, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    glyphIdx = new Int32Array(n);
    lift = new Float32Array(n);
    tone = new Float32Array(n);
    gold = new Float32Array(n);
    stampAge = new Float32Array(n);
    pressAge = new Float32Array(n);
    active.clear(); stamps.clear(); presses.clear();
    seq = Math.floor(Math.random() * Math.max(1, seqChars.length));
    for (let rr = rows - 1; rr >= 0; rr--) rowFill(rr);
    writeAttrs();
    scene.add(mesh);
    mesh.position.y = (scroll - Math.floor(scroll)) * PITCH;
  }

  // 整盘上移一格：每块的数据整行上挪，新的一行从底下进来
  function shiftRows() {
    const n = cols * rows;
    for (const arr of [glyphIdx, lift, tone, gold, stampAge, pressAge]) arr.copyWithin(cols, 0, n - cols);
    const move = (set) => {
      const next = [...set].map((i) => i + cols).filter((i) => i < n);
      set.clear();
      next.forEach((i) => set.add(i));
    };
    move(active); move(stamps); move(presses);
    rowFill(0);
    lift.fill(0, 0, cols); stampAge.fill(0, 0, cols); pressAge.fill(0, 0, cols);
    if (hoverRow >= 0) hoverRow = Math.min(rows - 1, hoverRow + 1);
    writeAttrs();
  }

  // ───────── 尺寸与机位 ─────────
  let W = 0;
  let H = 0;
  function layout() {
    const r = board.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === W && h === H) return;
    W = w; H = h;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // 屏幕中央的一块字约 TILE 像素：竖直方向看得见 H / TILE 格
    const dist = (H / TILE) / (2 * Math.tan((FOV * Math.PI) / 360));
    camera.position.set(0, -dist * Math.sin(TILT), dist * Math.cos(TILT));
    camera.near = dist * 0.3;
    camera.far = dist * 4;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camPos.copy(camera.position);
    uniforms.uFar.value = dist * 1.25;
    const needC = clamp(Math.ceil((W / TILE) * 1.7), 56, 130);
    const needR = clamp(Math.ceil((H / TILE) * 1.9), 40, 80);
    if (!mesh || needC > cols || needR > rows) build(needC, needR);
    request();
  }

  // ───────── 主题 ─────────
  function applyTheme() {
    const dark = isDark();
    const P = dark ? PALETTE.dark : PALETTE.light;
    uniforms.uBody.value.set(...P.body);
    uniforms.uGlyph.value.set(...P.glyph);
    uniforms.uGold.value.set(...P.gold);
    uniforms.uLightCol.value.set(...P.light);
    uniforms.uAmb.value.set(...P.amb);
    uniforms.uFog.value.set(...P.fog);
    uniforms.uSpec.value = P.spec;
    uniforms.uGoldOn.value = P.goldOn;
    request();
  }

  // ───────── 指针 ─────────
  const ray = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();
  const ndc = new Vector2();
  let ptr = null; // { x, y } 相对案的像素

  function pick(px, py) {
    if (!mesh) return null;
    ndc.set((px / W) * 2 - 1, -(py / H) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    const cx = hit.x / PITCH + cols / 2;
    const cy = (hit.y - mesh.position.y) / PITCH + rows / 2;
    const c = Math.floor(cx);
    const r = Math.floor(cy);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    return { c, r, fx: cx, fy: cy };
  }

  const onMove = (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = board.getBoundingClientRect();
    ptr = { x: e.clientX - b.left, y: e.clientY - b.top };
    hovering = true;
    const p = pick(ptr.x, ptr.y);
    hoverCol = p ? p.fx : -1;
    hoverRow = p ? p.fy : -1;
    request();
  };
  const onLeave = () => {
    hovering = false;
    ptr = null;
    hoverCol = hoverRow = -1;
    request();
  };
  const onClick = (e) => {
    const b = board.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    wash(x, y);
    const p = pick(x, y);
    if (!p) return;
    const i = p.r * cols + p.c;
    presses.add(i);
    pressAge[i] = 0;
    if (glyphIdx[i] >= 0) {
      if (stamps.size >= MAX_STAMPS) { // 最多留八枚：最老的让位
        let oldest = -1;
        for (const s of stamps) if (oldest < 0 || stampAge[s] > stampAge[oldest]) oldest = s;
        stamps.delete(oldest);
      }
      stamps.add(i);
      stampAge[i] = 0;
    }
    request();
  };

  // ───────── 逐帧 ─────────
  let dead = false;
  let raf = 0;
  let timer = 0;
  let last = 0;
  let busy = false;
  let wake = true; // 刚唤醒（尺寸、主题变了）：至少画一帧

  function update(dt) {
    // 滚动：悬停暂停
    if (!hovering) {
      scroll += SPEED * dt;
      const fl = Math.floor(scroll);
      while (curRow < fl) { curRow++; shiftRows(); }
      mesh.position.y = (scroll - fl) * PITCH;
    }
    // 抬起：鼠标附近的块朝目标抬，离开的回落
    const targets = new Map();
    if (hovering && hoverCol >= 0) {
      const r0 = Math.floor(hoverRow);
      const c0 = Math.floor(hoverCol);
      const R = Math.ceil(LIFT_R);
      for (let r = r0 - R; r <= r0 + R; r++) {
        for (let c = c0 - R; c <= c0 + R; c++) {
          if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
          const d = Math.hypot(c + 0.5 - hoverCol, r + 0.5 - hoverRow);
          if (d >= LIFT_R) continue;
          const k = 1 - d / LIFT_R;
          const i = r * cols + c;
          targets.set(i, LIFT * k * k * (0.45 + 0.55 * hash(i * 31 + curRow)));
          active.add(i);
        }
      }
    }
    const kf = 1 - Math.exp(-dt * 11);
    const touched = [];
    busy = false;
    for (const i of active) {
      const t = targets.get(i) ?? 0;
      if (Math.abs(t - lift[i]) > 0.004) busy = true; // 还没落定才要继续逐帧画
      lift[i] += (t - lift[i]) * kf;
      if (t === 0 && Math.abs(lift[i]) < 0.003) { lift[i] = 0; active.delete(i); }
      touched.push(i);
    }
    for (const i of presses) {
      pressAge[i] += dt;
      if (pressAge[i] > 0.9) presses.delete(i);
      touched.push(i);
    }
    for (const i of stamps) {
      stampAge[i] += dt;
      if (stampAge[i] > 6.7) stamps.delete(i);
      touched.push(i);
    }
    // 只重写动过的块
    const st = attrState.array;
    for (const i of touched) {
      st[i * 4] = lift[i] + pressOffset(i);
      st[i * 4 + 1] = stampAmt(i);
    }
    if (touched.length) attrState.needsUpdate = true;
  }

  const interactive = () => busy || presses.size > 0;
  const drifting = () => !hovering && !document.hidden; // 滚动
  const fading = () => stamps.size > 0;

  function frame(now) {
    raf = 0;
    if (dead || document.hidden) return;
    const dt = last ? clamp((now - last) / 1000, 0, 0.25) : 0;
    last = now;
    update(dt);
    renderer.render(scene, camera);
    wake = false;
    schedule();
  }

  function schedule() {
    if (dead || document.hidden || raf || timer) return;
    if (interactive() || wake) { raf = requestAnimationFrame(frame); return; }
    const wait = fading() ? 33 : drifting() ? 50 : 0;
    if (!wait) { last = 0; return; } // 静止：停帧
    timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, wait);
  }
  function request() {
    wake = true;
    if (timer) { clearTimeout(timer); timer = 0; }
    schedule();
  }

  const onVis = () => {
    document.documentElement.classList.toggle('is-away', document.hidden); // 纸背透字也跟着停
    if (document.hidden) {
      cancelAnimationFrame(raf); raf = 0;
      clearTimeout(timer); timer = 0;
      last = 0;
    } else { last = 0; request(); }
  };
  const onLost = (e) => { e.preventDefault(); board.dispatchEvent(new CustomEvent('zp-gl-lost')); };

  const ro = new ResizeObserver(layout);
  ro.observe(board);
  board.addEventListener('pointermove', onMove);
  board.addEventListener('pointerleave', onLeave);
  board.addEventListener('click', onClick);
  document.addEventListener('visibilitychange', onVis);
  canvas.addEventListener('webglcontextlost', onLost);
  const offTheme = onTheme(applyTheme);

  applyTheme();
  layout();
  board.classList.add('is-3d');
  document.documentElement.classList.add('has-scene');

  const api = {
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro.disconnect();
      offTheme();
      board.removeEventListener('pointermove', onMove);
      board.removeEventListener('pointerleave', onLeave);
      board.removeEventListener('click', onClick);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost);
      mesh?.dispose();
      geo?.dispose();
      material.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
      board.classList.remove('is-3d');
      document.documentElement.classList.remove('has-scene');
    },
    stats: () => ({
      frames: renderer.info.render.frame,
      cols, rows, hovering,
      dpr: renderer.getPixelRatio(), size: [W, H],
      raf: !!raf, timer: !!timer,
    }),
    // 调试：直接推进 dt 并画一帧（页面隐藏时 rAF 不跑）
    step(dt = 0.016) { update(dt); renderer.render(scene, camera); },
    hover(x, y) { onMove({ pointerType: 'mouse', clientX: x, clientY: y }); },
    leave: onLeave,
    click(x, y) { onClick({ clientX: x, clientY: y }); },
  };
  if (debug) window.__scene = api;
  return api;
}
