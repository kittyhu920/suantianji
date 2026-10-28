// 桌上的书（docs/DESIGN.md §19）：一册线装书，three.js 的实体。
//   形     竖长的线装书（宽 26、高 36，与命书的页 5:7 一致）：旧靛青的布面封面与底板，中间一叠书页（层层的纸边），封面绕书脊的转轴转
//   右装   传统的右装：书脊在右，封面从左边（书口）掀起，向右绕过书脊翻开；翻开后第一页在左，读的时候从右往左翻
//   书的话 封面绕书脊掀到过竖直（约 128°），整张扉页露出来；字写在扉页上（DOM，按扉页的四个角投影到屏幕，见 pageQuad）
//   姿态   首页、仪式、读命书、讲解页各有一个位姿，书在它们之间平滑地走过去，是同一本书
// 本地坐标：x 自书脊（-13）到书口（+13），z 自书头（-18）到书根（+18），y 向上。整本书（inner）绕 x 镜像（scale.x = -1）：
// 书脊在世界的右边，书口在左边；书头朝桌子里侧，书根朝玩家。镜像带来的贴图左右翻转，在封面贴图（repeat.x = -1）与命书的纸（three-book.js 的 uv）里翻回来。

import * as THREE from 'three';
import { paintCover, paintPaper, paintEdge, canvas } from './paint3d.js';
import { createSheets } from '../book/three-book.js';
import * as sfx from '../audio.js';

export const BOOK = { w: 26, d: 36, board: 0.42, block: 2.0, cover: 0.42 };
const TOP = BOOK.board + BOOK.block; // 书页最上面一张的高度
const SPEAK = (128 * Math.PI) / 180; // 书说话时封面掀起的角度：过了竖直，封面向书脊那一边倒靠，整张扉页露出来，看得见封面的里子（不是立着的一面墙）

export const POSES = {
  home: { x: 0, y: 0, z: -11, ry: 0, s: 1.25 }, // 居中偏里，器物摆在它前面与两侧
  ritual: { x: -31, y: 0, z: -19, ry: 0, s: 0.9 }, // 仪式：退到桌子里侧的左边旁观（器物与桌上的纸笺占中前部），缩小一点
  reading: { x: -18.75, y: 0, z: 0, ry: 0, s: 1.5 }, // 书脊在桌子正中（世界 x = pose.x + 12.5·s = 0），摊开在两边：翻到左边的是读完的，右边是封面
  doc: { x: 0, y: -6, z: -17, ry: 0, s: 0.5 },
};

const ease = (t) => 1 - Math.pow(1 - t, 3);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const SC = (BOOK.w - 0.8) / 500; // 命书的纸（three-book.js，一页宽 500 个单位）一个单位多少厘米

export function createBook(desk) {
  const { tex, poser, addTicker, invalidate } = desk;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.x = -1; // 右装：书脊在右（见文件头）
  root.add(inner);
  desk.root.add(root);
  const pose = poser(root, POSES.home);

  const cover = paintCover();
  const coverMap = tex(cover.color);
  const coverBump = tex(cover.bump, { srgb: false });
  for (const t of [coverMap, coverBump]) { t.repeat.set(-1, 1); t.offset.set(1, 0); } // 书是镜像摆的，封面的画布按看到的样子画，这里把 u 翻回来
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
  // 命书的纸（读命书时代替上面那叠书页）：挂在书脊上，x 向书口、y 向书头、z 向上，一个单位 SC 厘米
  const sheetsRoot = new THREE.Group();
  sheetsRoot.position.set(-BOOK.w / 2 + 0.5, 0, 0);
  sheetsRoot.rotation.x = -Math.PI / 2;
  sheetsRoot.scale.setScalar(SC);
  sheetsRoot.visible = false;
  inner.add(sheetsRoot);
  const reading = createSheets(desk, sheetsRoot, {
    z0r: (BOOK.board + 0.04) / SC,
    z0l: (BOOK.board / 2 + BOOK.cover + 0.05) / SC,
    stack: BOOK.block / SC,
  });
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

  // 布面的色：昼里偏灰（旧靛蓝），夜里暖灯把蓝压掉一截，所以夜里给布面补一点蓝，看上去仍是深靛
  const dayTint = new THREE.Color().setRGB(1.05, 1.0, 0.82); // 昼里窗光偏冷偏蓝，布面的底色偏暖一点压回来，看上去是褪了色的旧靛青，不是宝蓝
  const nightTint = new THREE.Color(0x4a78e6);
  const tintCloth = () => {
    const t = desk.themeT;
    clothTop.color.copy(dayTint).lerp(nightTint, t);
    clothSide.color.setHex(0x2b374e).lerp(nightTint.clone().multiplyScalar(0.24), t * 0.9);
    back.color.copy(clothSide.color);
  };
  desk.listeners.add(tintCloth);
  tintCloth();
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
    // 书脊的布随封面翻开而压平（翻到底时只剩底板那么高，不再是一根竖着的蓝柱）
    const k = Math.min(1, coverA / Math.PI);
    const hSpine = (BOOK.board + BOOK.block + BOOK.cover) * (1 - k * k) + (BOOK.board + 0.1) * k * k;
    spine.scale.y = hSpine / (BOOK.board + BOOK.block + BOOK.cover);
    spine.position.y = hSpine / 2;
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
  let collapsing = false;
  let pendingLift = null;
  const readTargets = { shut: 0, speak: SPEAK, open: Math.PI };
  function setLift(l, instant = false) {
    if (collapsing) { pendingLift = l; return; }
    lift = l;
    const a = readTargets[l];
    if (instant) { coverTicker?.(); coverTicker = null; coverA = coverGoal = a; applyCover(); invalidate(); return; }
    setCover(a, l === 'open' ? 3.2 : l === 'speak' ? 6 : 6.5);
  }

  /* ───────── 读命书：同一本书原地摊开 ───────── */
  // 读命书时书的位姿是桌子正中，相机走到读书的机位；命书的纸（reading）替下合着时那叠书页，封面翻开，纸就是命书的页。
  // 演出（beginReading，总长约 2.2 秒）：封面先合上、再翻开（有厚度、有纸响）→ 扉页浮现“命书”与卷名 → 停一下 → 翻到第一页。点一下可跳过。
  let intro = null;
  const swapSheets = (on) => { block.visible = !on; sheetsRoot.visible = on; };
  desk.readingPts = () => {
    const p = POSES.reading;
    const pts = [];
    for (const lx of [-BOOK.w / 2 - BOOK.w, BOOK.w / 2 - 0.3]) for (const lz of [-BOOK.d / 2, BOOK.d / 2]) pts.push(new THREE.Vector3(p.x - p.s * lx, p.s * 1.1, p.z + p.s * lz)); // 镜像：世界 x = pose.x - s·本地 x
    return pts;
  };
  function tweenCover(from, to, ms, f = easeIO) {
    coverTicker?.(); coverTicker = null;
    return new Promise((res) => {
      const t0 = performance.now();
      coverTicker = addTicker(() => {
        const u = intro?.skipped ? 1 : Math.min(1, (performance.now() - t0) / ms);
        coverA = coverGoal = from + (to - from) * f(u);
        applyCover();
        if (u >= 1) { coverTicker = null; res(); return false; }
        return true;
      });
    });
  }
  function beginReading({ onDone } = {}) {
    intro?.finish?.();
    const st = { skipped: false, done: false };
    intro = st;
    swapSheets(true);
    reading.reveal.body = 0;
    reading.reveal.title = 0;
    // 演出的时钟用挂钟，不用每帧的 dt（dt 有上限；第一帧上传纹理卡一下，用 dt 计时就会整体拖后）
    const wait = (ms) => new Promise((res) => {
      const t0 = performance.now();
      addTicker(() => { if (st.skipped || performance.now() - t0 >= ms) { res(); return false; } return true; });
    });
    const tween = (ms, f, e = easeIO) => new Promise((res) => {
      const t0 = performance.now();
      addTicker(() => {
        const u = st.skipped ? 1 : Math.min(1, (performance.now() - t0) / ms);
        f(e(u));
        if (u >= 1) { res(); return false; }
        return true;
      });
    });
    const end = () => {
      if (st.done) return;
      st.done = true;
      if (intro === st) intro = null;
      lift = 'open';
      coverA = coverGoal = readTargets.open;
      applyCover();
      reading.reveal.body = reading.reveal.title = 1;
      invalidate();
      onDone?.();
    };
    st.finish = () => { st.skipped = true; st.snap?.(); end(); };
    st.snap = () => {
      pose.to(POSES.reading, 5, true);
      desk.cameraTo('reading', 0, true);
      coverTicker?.(); coverTicker = null;
      if (reading.limit >= 1 && reading.spread < 1) reading.setSpread(1);
      api.version++;
    };
    (async () => {
      lift = 'open';
      if (coverA > 0.06) await tweenCover(coverA, 0, 120, ease); // 说话时掀着的封面先落回，合着的书才翻得开
      if (st.skipped) return;
      sfx.rustle(0.55, 0.11, true);
      const open = tweenCover(0, readTargets.open, 850).then(() => { if (!st.skipped) sfx.flop(0.12); }); // 封面落在桌上：一声闷响
      await wait(300);
      tween(380, (k) => { reading.reveal.body = k; });
      await wait(250);
      await tween(420, (k) => { reading.reveal.title = k; }); // “命书”与卷名浮现
      await open;
      await wait(250); // 停一下
      if (st.skipped) return;
      if (reading.limit >= 1) { sfx.rustle(0.4, 0.09, true); await Promise.race([reading.turn(1, { omega: 12, zeta: 0.9, bounce: 0.12 }), wait(650)]); } // 页翻过去了，回弹的尾巴不用等
      end();
    })();
    return { skip() { if (!st.done) st.finish(); }, get running() { return !st.done; } };
  }
  function skipIntro() { intro?.finish?.(); }

  // 读完合上：翻开的纸一起翻回去，封面绕书脊合拢，纸收起、合着的书页回来
  function leaveReading(instant) {
    skipIntro();
    if (instant) { reading.clear(); swapSheets(false); return; }
    collapsing = true;
    pendingLift = null;
    reading.collapse(320).then(() => {
      collapsing = false;
      sfx.rustle(0.4, 0.08, false);
      setLift(pendingLift ?? 'shut');
      pendingLift = null;
      const stop = addTicker(() => {
        if (mode === 'reading') { stop(); return false; } // 又回去读了
        if (coverA > 0.05) return true;
        reading.clear();
        swapSheets(false);
        invalidate();
        return false;
      });
    });
  }
  function setMode(m, instant = false) {
    const was = mode;
    mode = m;
    pose.to(POSES[m] ?? POSES.home, m === 'reading' ? 2.6 : 4.2, instant);
    desk.cameraTo(m === 'reading' ? 'reading' : 'table', m === 'reading' ? 1300 : 900, instant);
    inner.position.x = 0;
    root.visible = true;
    if (was === 'reading' && m !== 'reading') leaveReading(instant);
    invalidate();
  }
  pose.onMove = () => { api.version++; };

  /* ───────── 书的话那张纸笺的位置 ───────── */
  const camRay = new THREE.Raycaster();
  const v = new THREE.Vector3();
  const toLocal = new THREE.Vector3();
  /**
   * 扉页上写字的那一块（画布像素）。书脊在右、封面从左边掀起：掀过竖直（说话时 128°）之后，整张扉页都露在外面，
   * 字写在书口一侧到订口之前的一块（留出订口的暗处）；封面还没掀过竖直（落回、合上的路上）时，按封面自由边的顶端落下来的视线算，只用没被遮住的那一段。
   * 返回 [左上, 右上, 右下, 左下]（屏幕上的位置），带 ratio（高 / 宽）。
   */
  function pageQuad() {
    root.updateMatrixWorld(true);
    const xb = bw / 2 - 1.1; // 书口一侧（本地 +x，世界的左边）
    let xa = -BOOK.w / 2 + 3.4; // 订口一侧，留出订线与凹处
    if (coverA < 1.5) {
      const tip = new THREE.Vector3(BOOK.w - 0.5, BOOK.cover / 2, 0).applyMatrix4(pivot.matrixWorld);
      const dir = tip.clone().sub(desk.camera.position).normalize();
      camRay.set(desk.camera.position, dir);
      const pageTopWorld = new THREE.Vector3(0, TOP, 0).applyMatrix4(inner.matrixWorld).y;
      const t = (pageTopWorld - tip.y) / dir.y;
      v.copy(tip).addScaledVector(dir, t);
      toLocal.copy(v);
      inner.worldToLocal(toLocal);
      xa = Math.max(xa, Math.min(xb - 6, toLocal.x + 1.1)); // 封面压着的那一段不写
    }
    const za = bd / 2 - 1.2;
    const pts = [[xb, -za], [xa, -za], [xa, za], [xb, za]];
    const out = pts.map(([x, z]) => desk.project(inner.localToWorld(new THREE.Vector3(x, TOP + 0.03, z))));
    out.ratio = (2 * za) / (xb - xa);
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
    setMode, setLift, pageQuad, reading, beginReading, skipIntro,
    get mode() { return mode; },
    get lift() { return lift; },
    set visible(b) { root.visible = b; invalidate(); },
    get coverAngle() { return coverA; },
  };
  setMode('home', true);
  setLift('shut', true);
  desk.fit();
  return api;
}
