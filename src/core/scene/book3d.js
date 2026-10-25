// 桌上的书（docs/DESIGN.md §19）：一册线装书，three.js 的实体。
//   形     深靛布面的封面与底板，中间一叠书页（层层的纸边），封面绕书脊的转轴转（书脊在里侧：封面从近处这一边掀起来，朝里靠）
//   书的话 封面掀起约 38°，露出扉页；字写在扉页上（DOM，按扉页的四个角投影到屏幕，见 pageQuad），不再有横贴在封面上的纸条
//   姿态   首页、仪式、读命书、讲解页各有一个位姿，书在它们之间平滑地走过去，是同一本书
// 本地坐标（竖放时的样子）：x 自书脊（-13）到书口（+13），z 自书头（-18）到书根（+18），y 向上。书脊朝里（桌子的远端）时，书绕 y 转 -90°。

import * as THREE from 'three';
import { paintCover, paintPaper, paintEdge, canvas } from './paint3d.js';

export const BOOK = { w: 26, d: 36, board: 0.42, block: 2.0, cover: 0.42 };
const TOP = BOOK.board + BOOK.block; // 书页最上面一张的高度
const SPEAK = (38 * Math.PI) / 180;

export const POSES = {
  home: { x: 0, y: 0, z: -9, ry: -Math.PI / 2, s: 1.4 },
  ritual: { x: 0, y: 0, z: -15.5, ry: -Math.PI / 2, s: 1.2 },
  reading: { x: 13, y: 0, z: -2, ry: 0, s: 1.5 },
  doc: { x: 0, y: -6, z: -17, ry: -Math.PI / 2, s: 0.5 },
};

const ease = (t) => 1 - Math.pow(1 - t, 3);

export function createBook(desk) {
  const { tex, poser, addTicker, invalidate } = desk;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  desk.root.add(root);
  const pose = poser(root, POSES.home);

  const cover = paintCover();
  const coverMap = tex(cover.color);
  const coverBump = tex(cover.bump, { srgb: false });
  const clothSide = new THREE.MeshStandardMaterial({ color: 0x2b374e, roughness: 0.9 });
  const clothTop = new THREE.MeshStandardMaterial({ map: coverMap, bumpMap: coverBump, bumpScale: 0.6, roughness: 0.82 });
  const endpaper = new THREE.MeshStandardMaterial({ map: tex(paintPaper({ seed: 9, base: [214, 200, 168], gutter: 0.35 })), roughness: 0.95 });
  const back = new THREE.MeshStandardMaterial({ color: 0x2b374e, roughness: 0.9 });

  // 底板
  const board = new THREE.Mesh(new THREE.BoxGeometry(BOOK.w, BOOK.board, BOOK.d), [clothSide, clothSide, back, back, clothSide, clothSide]);
  board.position.y = BOOK.board / 2;
  inner.add(board);

  // 书页：一叠纸。上面是扉页，三面是层层的纸边
  const paper = tex(paintPaper({ seed: 4, base: [236, 227, 204], gutter: 0.5, w: 512, h: 512 }));
  const edgeTex = tex(paintEdge(), {});
  edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
  edgeTex.repeat.set(1, 14);
  const edge = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95, color: 0xe6dcc0 });
  const top = new THREE.MeshStandardMaterial({ map: paper, roughness: 0.92 });
  const bw = BOOK.w - 0.7;
  const bd = BOOK.d - 0.7;
  const block = new THREE.Mesh(new THREE.BoxGeometry(bw, BOOK.block, bd), [edge, edge, top, edge, edge, edge]);
  block.position.set(0.1, BOOK.board + BOOK.block / 2, 0);
  inner.add(block);
  // 书脊：包住书页一侧的布
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, BOOK.board + BOOK.block + BOOK.cover, BOOK.d), clothSide);
  spine.position.set(-BOOK.w / 2 - 0.25 + 0.5, (BOOK.board + BOOK.block + BOOK.cover) / 2, 0);
  inner.add(spine);
  // 订线：四眼，丝线绕过书脊（几小段白线横在封面与底板的边上）
  // —— 画在封面纹理里；这里只在书脊边上加四段小的线圈
  const threadMat = new THREE.MeshStandardMaterial({ color: 0xe4dbc2, roughness: 0.8 });
  for (const zc of [-13.2, -4.9, 3.4, 12.1]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.075, 6, 14, Math.PI * 1.5), threadMat);
    t.position.set(-BOOK.w / 2 + 0.05, BOOK.board + BOOK.block * 0.55, zc);
    t.rotation.set(0, Math.PI / 2, 0);
    inner.add(t);
  }

  // 封面：绕书脊转
  const pivot = new THREE.Group();
  pivot.position.set(-BOOK.w / 2 + 0.5, TOP + BOOK.cover / 2, 0);
  inner.add(pivot);
  const coverMesh = new THREE.Mesh(new THREE.BoxGeometry(BOOK.w, BOOK.cover, BOOK.d), [clothSide, clothSide, clothTop, endpaper, clothSide, clothSide]);
  coverMesh.position.set(BOOK.w / 2 - 0.5, 0, 0);
  pivot.add(coverMesh);
  // 撕口：存疑时封面裂开的一道（平时不显示）
  const tearCv = canvas(512, 256);
  const tearMat = new THREE.MeshBasicMaterial({ map: tex(tearCv), transparent: true, opacity: 0, depthWrite: false });
  const tearM = new THREE.Mesh(new THREE.PlaneGeometry(BOOK.d * 0.92, 5), tearMat);
  tearM.rotation.x = -Math.PI / 2;
  tearM.rotation.z = Math.PI / 2;
  tearM.position.set(BOOK.w / 2 - 0.5 + 1, BOOK.cover / 2 + 0.02, 0);
  coverMesh.add(tearM);

  desk.shadowed(root);
  board.castShadow = true;
  // 接触影
  const contact = desk.blob(BOOK.w * 1.12, BOOK.d * 1.06, 0.4);
  contact.position.set(0.6, 0.03, 0);
  inner.add(contact);

  /* ───────── 封面的角度与书的姿态 ───────── */
  let coverA = 0;
  let coverGoal = 0;
  let coverTicker = null;
  let coverRate = 7;
  function applyCover() {
    pivot.rotation.z = coverA;
    // 翻开到底时，封面落在桌面上（与底板齐平），而不是悬在书页的高度
    const drop = Math.max(0, Math.min(1, (coverA - 1.6) / (Math.PI - 1.6)));
    pivot.position.y = TOP + BOOK.cover / 2 - drop * (TOP - BOOK.board / 2 + 0.0);
    contact.visible = true;
    api.version++;
  }
  function setCover(angle, rate = 7) {
    coverGoal = angle;
    coverRate = rate;
    if (coverTicker) return;
    coverTicker = addTicker((dt) => {
      const d = coverGoal - coverA;
      if (Math.abs(d) < 0.0015) { coverA = coverGoal; applyCover(); coverTicker = null; return false; }
      coverA += d * (1 - Math.exp(-coverRate * dt));
      applyCover();
      return true;
    });
  }

  let mode = 'home';
  let lift = 'shut';
  const readTargets = { shut: 0, speak: SPEAK, open: Math.PI - 0.015 };
  function setLift(l, instant = false) {
    lift = l;
    const a = readTargets[l];
    if (instant) { coverA = coverGoal = a; applyCover(); invalidate(); return; }
    setCover(a, l === 'open' ? 3.2 : l === 'speak' ? 6 : 6.5);
  }
  function setMode(m, instant = false) {
    mode = m;
    pose.to(POSES[m] ?? POSES.home, m === 'reading' ? 2.8 : 4.2, instant);
    inner.position.x = 0;
    root.visible = true;
    invalidate();
  }
  pose.onMove = () => { api.version++; };

  /* ───────── 书的话那张纸笺的位置 ───────── */
  const camRay = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const toLocal = new THREE.Vector3();
  /**
   * 扉页上写字的那一块（地面上的四个点，画布像素）：封面掀起之后，扉页近处这一半从封面下面露出来。
   * 从封面的自由边顶端顺着视线落到扉页上，那一点之后就是看得见的。返回 [远左, 远右, 近右, 近左]。
   */
  function pageQuad() {
    root.updateMatrixWorld(true);
    // 封面自由边顶端（世界）
    const tip = new THREE.Vector3(BOOK.w, 0, 0).applyMatrix4(coverMesh.matrixWorld);
    tip.set(BOOK.w - 0.5, BOOK.cover / 2, 0).applyMatrix4(pivot.matrixWorld);
    const dir = tip.clone().sub(desk.camera.position).normalize();
    camRay.set(desk.camera.position, dir);
    const pageTopWorld = new THREE.Vector3(0, TOP, 0).applyMatrix4(inner.matrixWorld).y;
    const t = (pageTopWorld - tip.y) / dir.y;
    v.copy(tip).addScaledVector(dir, t);
    toLocal.copy(v);
    inner.worldToLocal(toLocal);
    const xa = Math.min(BOOK.w / 2 - 6, toLocal.x + 1.1); // 留一点边
    const xb = bw / 2 - 1.1;
    const za = bd / 2 - 1.2;
    const pts = [[xa, za], [xa, -za], [xb, -za], [xb, za]];
    const out = pts.map(([x, z]) => desk.project(inner.localToWorld(new THREE.Vector3(x, TOP + 0.03, z))));
    out.ratio = (xb - xa) / (2 * za);
    return out;
  }

  /* ───────── 书自己的动作（docs/DESIGN.md §19 "书自己的动作"） ───────── */
  let fxTicker = null;
  function runFx(ms, f) {
    let t = 0;
    fxTicker?.();
    fxTicker = addTicker((dt) => {
      t += dt * 1000;
      const u = Math.min(1, t / ms);
      f(u);
      if (u >= 1) { f(1); fxTicker = null; return false; }
      return true;
    });
  }
  const fx = {
    tremble() {
      runFx(850, (u) => { const k = (1 - u) * Math.sin(u * 40); inner.position.x = k * 0.18; inner.rotation.y = k * 0.012; });
    },
    thud() {
      runFx(520, (u) => { inner.position.y = -0.7 * Math.sin(Math.min(1, u * 1.6) * Math.PI) * (1 - u) ** 1.2; });
    },
    riffle() {
      const base = coverGoal;
      setCover(1.08, 9);
      setTimeout(() => setCover(base, 6), 560);
    },
    tear() {
      const g = tearCv.getContext('2d');
      g.clearRect(0, 0, 512, 256);
      g.beginPath();
      let x = 256;
      g.moveTo(x, 0);
      for (let i = 1; i <= 12; i++) { x = Math.max(150, Math.min(360, x + (Math.random() - 0.5) * 70)); g.lineTo(x, (256 * i) / 12); }
      g.strokeStyle = '#efe5cb'; g.lineWidth = 30; g.lineJoin = 'miter'; g.stroke();
      g.strokeStyle = '#0c0a07'; g.lineWidth = 12; g.stroke();
      tearMat.map.needsUpdate = true;
      runFx(700, (u) => { tearMat.opacity = u < 0.12 ? u / 0.12 : 1 - Math.max(0, (u - 0.7) / 0.3); inner.position.z = Math.sin(u * 30) * (1 - u) * 0.22; });
      return new Promise((r) => setTimeout(r, 900));
    },
  };

  const api = {
    root, inner, pose, version: 0, fx,
    setMode, setLift, pageQuad,
    get mode() { return mode; },
    get lift() { return lift; },
    set visible(b) { root.visible = b; invalidate(); },
    get coverAngle() { return coverA; },
  };
  setMode('home', true);
  setLift('shut', true);
  return api;
}
