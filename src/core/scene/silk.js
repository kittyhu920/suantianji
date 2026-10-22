// 深色主题下的写经绢帛：几幅墨底泥金的绢，带弧度、缓缓起伏、层层叠叠，横在字盘之上、画心之后。
// 绢上的字取本卷的 zipan，运行时用 Canvas 写成一张泥金字的纹理（透明底），在着色器里随起伏受光。
// 不用位图素材。只在深色主题里出现；浅色主题时整组隐藏、不再更新。

import {
  Group, Mesh, PlaneGeometry, ShaderMaterial, CanvasTexture, LinearFilter, LinearMipmapLinearFilter,
  Vector3, DoubleSide,
} from 'three';

const BRUSH = '"Ma Shan Zheng", "STKaiti", "KaiTi", "Noto Serif SC", serif';
const TEX_W = 3072;
const TEX_H = 288;
const BAND_W = 64; // 世界单位：一幅绢的长
const BAND_H = 6;

const rnd = (seed) => { // 小随机数：每幅绢写得不一样，但每次打开是同一幅
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
};

// 一幅绢上的字：几行泥金小楷，行有长短，字有大小与墨色浓淡
function paintText(chars, seed, { leaves = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = TEX_W;
  cv.height = TEX_H;
  const g = cv.getContext('2d');
  const r = rnd(seed);
  const rows = 9;
  const pitch = TEX_H / (rows + 0.6);
  let k = Math.floor(r() * chars.length);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  for (let row = 0; row < rows; row++) {
    const y = pitch * (row + 0.8);
    const size = pitch * (0.64 + r() * 0.08);
    g.font = `400 ${size.toFixed(1)}px ${BRUSH}`;
    const start = TEX_W * (0.01 + r() * 0.05);
    const end = TEX_W * (0.8 + r() * 0.19);
    for (let x = start; x < end; x += size * (0.98 + r() * 0.1)) {
      const ch = chars[k++ % chars.length];
      const a = 0.5 + r() * 0.4;
      g.save();
      g.translate(x, y + (r() - 0.5) * 3);
      g.rotate((r() - 0.5) * 0.09);
      g.shadowColor = 'rgba(255, 214, 120, .55)'; // 泥金的一点晕
      g.shadowBlur = 4;
      g.fillStyle = `rgba(255, 226, 150, ${a.toFixed(2)})`;
      g.fillText(ch, 0, 0);
      g.restore();
    }
  }
  if (leaves) paintLeaves(g, r);
  const tex = new CanvasTexture(cv);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// 泥金竹叶：一枝，几片，叶尖朝外
function paintLeaves(g, r) {
  g.save();
  g.translate(TEX_W * 0.86, TEX_H * 0.5);
  g.shadowColor = 'rgba(255, 214, 120, .5)';
  g.shadowBlur = 5;
  const leaf = (ang, len, w) => {
    g.save();
    g.rotate(ang);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.3, -w, len * 0.75, -w * 0.7, len, 0);
    g.bezierCurveTo(len * 0.75, w * 0.5, len * 0.3, w * 0.9, 0, 0);
    g.fillStyle = 'rgba(255, 222, 140, .9)';
    g.fill();
    g.strokeStyle = 'rgba(120, 80, 20, .55)';
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.92, 0); g.stroke();
    g.restore();
  };
  g.strokeStyle = 'rgba(255, 214, 120, .8)';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(-TEX_W * 0.08, TEX_H * 0.3); g.quadraticCurveTo(-TEX_W * 0.03, TEX_H * 0.05, 0, 0); g.stroke();
  for (let i = 0; i < 7; i++) leaf(-1.15 + i * 0.42 + (r() - 0.5) * 0.2, 120 + r() * 70, 17 + r() * 8);
  g.restore();
}

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uAmp;
  uniform float uBow;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  varying float vDepth;
  float height(vec2 p) {
    float a = sin(p.x * 0.11 + uTime * 0.32 + uPhase) * uAmp;
    a += sin(p.x * 0.29 - p.y * 0.7 + uTime * 0.45 + uPhase * 1.7) * uAmp * 0.32;
    a += uBow * (p.y * p.y) / 9.0; // 横向的弧度：绢不是平的，两边卷起
    return a;
  }
  void main() {
    vec3 p = position;
    float e = 0.08;
    float hx = height(p.xy + vec2(e, 0.0)) - height(p.xy - vec2(e, 0.0));
    float hy = height(p.xy + vec2(0.0, e)) - height(p.xy - vec2(0.0, e));
    p.z += height(p.xy);
    vec3 n = normalize(vec3(-hx / (2.0 * e), -hy / (2.0 * e), 1.0));
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vN = mat3(modelMatrix) * n;
    vW = wp.xyz;
    vUv = uv;
    vec4 mv = viewMatrix * wp;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform sampler2D uTex;
  uniform vec3 uLight;
  uniform vec3 uCam;
  uniform float uAlpha;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  varying float vDepth;
  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(uCam - vW);
    vec3 L = normalize(uLight);
    vec3 H = normalize(L + V);
    float diff = max(dot(N, L), 0.0);
    float sheen = pow(max(dot(N, H), 0.0), 18.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    float weave = 0.5 + 0.5 * sin((vUv.x * 900.0 + vUv.y * 140.0)) * sin(vUv.y * 160.0 - vUv.x * 300.0);
    vec3 cloth = vec3(0.030, 0.027, 0.024) * (0.55 + 1.1 * diff) * (0.92 + 0.08 * weave);
    cloth += vec3(0.95, 0.74, 0.36) * (sheen * 0.16 + rim * 0.05);
    vec4 t = texture2D(uTex, vUv);
    vec3 gold = mix(vec3(0.30, 0.21, 0.08), vec3(0.80, 0.62, 0.32), clamp(diff * 0.45 + sheen * 1.4, 0.0, 1.0));
    vec3 col = mix(cloth, gold, t.a);
    float edge = smoothstep(0.0, 0.05, vUv.y) * smoothstep(0.0, 0.05, 1.0 - vUv.y);
    float ends = smoothstep(0.0, 0.03, vUv.x) * smoothstep(0.0, 0.03, 1.0 - vUv.x);
    col *= mix(1.0, 0.5, smoothstep(45.0, 110.0, vDepth)); // 景深：远的更暗
    gl_FragColor = vec4(col, uAlpha * edge * ends);
  }
`;

/**
 * 做一组绢。返回 { group, update(t), dispose() }。
 * layout 里每一幅：位置、绕 z 的角度、绕 x 的倾角、起伏幅度与相位。层次靠 z 与 renderOrder。
 */
export function createSilks({ chars, lightDir, camPos }) {
  const group = new Group();
  const geo = new PlaneGeometry(BAND_W, BAND_H, 160, 14);
  const bands = [
    { x: -6, y: 9, z: 3.5, rz: -0.5, rx: 0.32, amp: 0.8, bow: 0.5, phase: 0.0, seed: 11, leaves: false, a: 0.96 },
    { x: 8, y: -3, z: 7.5, rz: -0.42, rx: -0.2, amp: 1.0, bow: -0.7, phase: 2.1, seed: 23, leaves: true, a: 0.97 },
    { x: -10, y: -13, z: 11.5, rz: -0.58, rx: 0.4, amp: 1.2, bow: 0.8, phase: 4.2, seed: 37, leaves: false, a: 0.97 },
  ];
  const mats = [];
  const texes = [];
  bands.forEach((b, i) => {
    const tex = paintText(chars, b.seed, { leaves: b.leaves });
    texes.push(tex);
    const mat = new ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uTime: { value: 0 },
        uAmp: { value: b.amp },
        uBow: { value: b.bow },
        uPhase: { value: b.phase },
        uLight: { value: new Vector3(...lightDir) },
        uCam: { value: camPos },
        uAlpha: { value: b.a },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: DoubleSide,
    });
    mats.push(mat);
    const m = new Mesh(geo, mat);
    m.position.set(b.x, b.y, b.z);
    m.rotation.set(b.rx, 0, b.rz, 'ZXY');
    m.renderOrder = 10 + i;
    m.frustumCulled = false;
    group.add(m);
  });
  return {
    group,
    update(t) { for (const m of mats) m.uniforms.uTime.value = t; },
    dispose() { geo.dispose(); mats.forEach((m) => m.dispose()); texes.forEach((t) => t.dispose()); },
  };
}
