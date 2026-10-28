// 签筒与筊杯（签卷的器物，docs/DESIGN.md §5）：竹筒、十三支竹签、一支会飞出来的签，一对红漆的筊杯。
// 摇签的物理在 src/juan/qian/tube.js（侧视的二维物理，一个像素 = S 厘米）；这里是它的 3D 表现（view）：
// 每一帧把物理状态放到 3D 里：筒绕筒底倾、签受力跳动、冒头的那支慢慢升起、飞出的签落在桌上，躺平。
// 同一个筒从首页到卷首到摇签到掷筊，只有这一个。

import * as THREE from 'three';
import { paintBamboo, canvas, makeNoise } from '../paint3d.js';
import { lathe, puffPool, inkDots } from './common.js';
import { trueRandom } from '../../rng.js';

const S = 0.107; // 物理的一个像素，对应多少厘米
const PX = 160;
const PY = 402;
const STICK_LEN = 250;
const STICK_W = 8;
const N = 13;
const H = 22;
const R0 = 4.5;
const R1 = 4.85;
const TH = 0.28; // 竹签的厚度
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function stickTexture(desk) {
  const cv = canvas(48, 768);
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 48, 0);
  gr.addColorStop(0, '#c79d57'); gr.addColorStop(0.45, '#e2bf7c'); gr.addColorStop(1, '#b98f4d');
  g.fillStyle = gr;
  g.fillRect(0, 0, 48, 768);
  const N2 = makeNoise(5);
  for (let y = 0; y < 768; y += 2) { g.fillStyle = `rgba(80,50,20,${(N2.n2(y * 0.1, 3) * 0.22).toFixed(3)})`; g.fillRect(0, y, 48, 2); }
  for (let x = 4; x < 48; x += 7) { g.fillStyle = 'rgba(90,60,25,.2)'; g.fillRect(x, 0, 1, 768); }
  g.fillStyle = '#2c1e12'; // 签头的墨
  g.fillRect(0, 0, 48, 56);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.fillRect(0, 300, 48, 2);
  g.fillRect(0, 560, 48, 2);
  return desk.tex(cv, {});
}

function crescent(bendK = 0.11) {
  const rx = 3.2;
  const ry = 1.25;
  const rz = 1.35;
  const half = new THREE.SphereGeometry(1, 30, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const flat = new THREE.CircleGeometry(1, 30);
  flat.rotateX(Math.PI / 2);
  for (const g of [half, flat]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * rx;
      const y = p.getY(i) * ry;
      let z = p.getZ(i) * rz;
      z *= 1 - 0.32 * (x / rx) ** 2; // 两头收
      z += bendK * x * x - 0.5; // 弯成一弯新月
      p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
  }
  return [half, flat];
}

export function buildQian(desk) {
  const group = new THREE.Group();
  const rig = new THREE.Group();
  group.add(rig);

  // ───── 筒 ─────
  const bam = paintBamboo();
  const map = desk.tex(bam.color);
  const bumpMap = desk.tex(bam.bump, { srgb: false });
  const roughnessMap = desk.tex(bam.rough, { srgb: false });
  const nodes = [0.34 * H, 0.68 * H];
  const prof = [[0.001, 0], [R0 - 0.55, 0], [R0 - 0.12, 0.16], [R0, 0.55]];
  for (let y = 0.9; y <= H - 0.45; y += 0.45) {
    let bump = 0.18 * Math.exp(-(((y - 0.04) / 0.5) ** 2));
    for (const n of nodes) bump += 0.16 * Math.exp(-(((y - n) / 0.34) ** 2));
    prof.push([R0 + (R1 - R0) * (y / H) + bump, y]);
  }
  prof.push([R1 + 0.02, H - 0.2], [R1 - 0.04, H + 0.01], [R1 - 0.5, H + 0.01]);
  const outer = new THREE.Mesh(
    lathe(prof, 56, H),
    new THREE.MeshStandardMaterial({ map, bumpMap, bumpScale: 1.6, roughnessMap, roughness: 1, metalness: 0 }),
  );
  outer.rotation.y = Math.PI;
  const inside = new THREE.Mesh(
    lathe([[R1 - 0.5, H + 0.01], [R1 - 0.56, H - 0.2], [R1 - 0.56, 2.4], [0.001, 2.2]], 40, H),
    new THREE.MeshStandardMaterial({ color: 0x1a0f07, roughness: 0.95, side: THREE.DoubleSide }),
  );
  rig.add(outer, inside);

  // ───── 签 ─────
  const stickGeo = new THREE.BoxGeometry((STICK_W * S) * 1.0, STICK_LEN * S, TH);
  const stickMat = new THREE.MeshStandardMaterial({ map: stickTexture(desk), roughness: 0.62 });
  const sticks = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(stickGeo, stickMat);
    rig.add(m);
    sticks.push(m);
  }
  const zOff = Array.from({ length: N }, () => 0);

  // 飞出来的那一支
  const flyHolder = new THREE.Group();
  const flyRoll = new THREE.Group();
  const flyMat = stickMat.clone(); // 飞出的这一支单独一份材质：签条淡入时，它淡出
  flyMat.transparent = true;
  const flyMesh = new THREE.Mesh(stickGeo, flyMat);
  flyRoll.add(flyMesh);
  flyHolder.add(flyRoll);
  flyHolder.visible = false;
  group.add(flyHolder);

  // 接触影
  const contact = desk.blob(R1 * 3.1, R1 * 3.1, 0.8);
  group.add(contact);
  const flyShadow = desk.blob(5, 3, 0.55);
  flyShadow.visible = false;
  group.add(flyShadow);
  desk.shadowed(group);
  inside.castShadow = false;

  // 拾取：一根看不见的圆柱
  const hitMesh = new THREE.Mesh(new THREE.CylinderGeometry(R1 + 0.6, R0 + 0.6, H + 3, 14), new THREE.MeshBasicMaterial({ visible: false }));
  hitMesh.position.y = (H + 3) / 2 - 0.5;
  group.add(hitMesh);

  const dustPool = puffPool(desk, { max: 28, color: 0x7a6a52 });
  group.add(dustPool.group);
  const ink = inkDots(desk); // 签落桌上溅出的墨点
  group.add(ink.group);

  /* ───── 物理 → 3D ───── */
  let lastSig = '';
  let flyStart = 0;
  let zLand = 11;
  let flyT = 0;
  let simT = 0;

  const view = {
    /** 屏幕上的 clientX 换成物理里的 x（以筒底中心为 PX） */
    toX(clientX) {
      const r = desk.rect;
      const o = group.getWorldPosition(new THREE.Vector3());
      const a = desk.project(o);
      const b = desk.project(o.clone().add(new THREE.Vector3(1, 0, 0)));
      const pxPerWorldCm = Math.max(1e-3, b.x - a.x);
      return PX + ((clientX - r.left - a.x) / pxPerWorldCm / group.scale.x) / S;
    },
    reset(list) {
      for (let i = 0; i < N; i++) {
        const s = list[i];
        const dx = (s.x - PX) * S;
        const rr = Math.max(0, (R0 - 0.9) ** 2 - dx * dx);
        zOff[i] = (trueRandom() - 0.5) * 2 * Math.sqrt(rr) * 0.9;
        sticks[i].visible = true;
      }
      flyHolder.visible = false;
      flyShadow.visible = false;
      rig.rotation.z = 0;
      flyMat.opacity = 1;
      ink.clear();
      dustPool.clear();
      lastSig = '';
      zLand = 10 + trueRandom() * 3;
    },
    launch(st) {
      flyStart = simT;
      flyT = 0;
      flyHolder.visible = true;
      flyShadow.visible = true;
      sticks.forEach((m) => { m.userData.gone = false; });
    },
    done() { lastSig = ''; },
    /** 签条淡入的同时，横躺在桌上的这一支淡出（只留签条） */
    fadeStick(ms = 450) {
      if (!flyHolder.visible) return;
      let t = 0;
      desk.addTicker((dt) => {
        t += dt * 1000;
        const u = clamp(t / ms, 0, 1);
        flyMat.opacity = 1 - u;
        flyShadow.material.opacity = 0.5 * (1 - u);
        if (u >= 1) { flyHolder.visible = false; flyShadow.visible = false; return false; }
        return true;
      });
    },
    burst(x, y, power) {
      const wx = (x - PX) * S;
      ink.splat(wx, zLand * 0.95, 3 + Math.floor(trueRandom() * 3)); // 墨点 3 到 5 个
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * (0.05 + 0.9 * trueRandom());
        const sp = (3 + 8 * trueRandom()) * (0.5 + power);
        dustPool.emit({ x: wx + (trueRandom() - 0.5) * 3, y: 0.3, z: zLand * 0.9 + (trueRandom() - 0.5) * 2, vx: Math.cos(a) * sp * 0.6, vy: Math.abs(Math.sin(a)) * sp * 0.5, vz: (trueRandom() - 0.3) * 3, r0: 0.25 + trueRandom() * 0.3, grow: 1.6, life: 0.5 + trueRandom() * 0.5, a: 0.38, gravity: -12, drag: 2 });
      }
    },
    tick(dt) { simT += dt; dustPool.tick(dt); },
    draw(st, list) {
      rig.rotation.z = -rad(st.a);
      rig.position.y = Math.abs(Math.sin(rad(st.a))) * R1; // 筒绕筒底中心倾，低的那一边的底沿会扎进桌面，整只筒抬起一个半径乘 sin
      let osum = 0;
      for (let i = 0; i < N; i++) {
        const s = list[i];
        const m = sticks[i];
        const base = s === st.pick && st.phase === 'shake' ? -st.energy * s.rise : 0;
        const cy = s.top + s.o + base + STICK_LEN / 2;
        osum += s.o + base;
        if (s === st.pick && st.phase !== 'shake') { m.visible = false; continue; }
        m.position.set((s.x - PX) * S, (PY - cy) * S, zOff[i]);
        m.rotation.z = -rad(s.tilt);
      }
      let fsig = '';
      if (st.fly && flyHolder.visible) {
        const f = st.fly;
        flyT = simT - flyStart;
        const prog = clamp(flyT / 0.75, 0, 1);
        const z = zLand * (1 - (1 - prog) ** 2);
        const h = Math.max(TH / 2, (PY - f.y) * S - (STICK_W * S) / 2 + TH / 2);
        flyHolder.position.set((f.x - PX) * S, h, z);
        flyHolder.rotation.z = -rad(f.rot);
        // 离桌面越近，越翻成平躺的样子（宽面朝上）
        flyRoll.rotation.y = (Math.PI / 2) * clamp(1 - (h - 0.5) / 5, 0, 1);
        flyShadow.position.set(flyHolder.position.x, 0.03, z);
        flyShadow.scale.set(Math.max(3, Math.abs(Math.sin(rad(f.rot))) * STICK_LEN * S * 0.9), 2.2, 1);
        flyShadow.material.opacity = 0.5 * clamp(1 - h / 24, 0.1, 1);
        fsig = `${f.x.toFixed(1)}|${f.y.toFixed(1)}|${f.rot.toFixed(1)}`;
      }
      const sig = `${st.a.toFixed(2)}|${osum.toFixed(1)}|${fsig}|${dustPool.alive}`;
      if (sig === lastSig) return;
      lastSig = sig;
      desk.frameNow();
    },
  };

  /* ───── 筊杯：一对红漆的新月形木块 ───── */
  const cupGroup = new THREE.Group();
  cupGroup.visible = false;
  cupGroup.scale.setScalar(1.4);
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x7e1f19, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.18 });
  const cups = [0, 1].map((i) => {
    const holder = new THREE.Group();
    const roll = new THREE.Group();
    const [half, flat] = crescent(i ? -0.11 : 0.11);
    const a = new THREE.Mesh(half, lacquer);
    const b = new THREE.Mesh(flat, lacquer);
    roll.add(a, b);
    holder.add(roll);
    cupGroup.add(holder);
    const sh = desk.blob(7.5, 4.6, 0.7);
    cupGroup.add(sh);
    desk.shadowed(holder);
    return { holder, roll, sh, rx: 0, flat: false };
  });
  const CUP_X = [-4.2, 4.2];
  const restCups = () => cups.forEach((c, i) => {
    c.holder.position.set(CUP_X[i], 0, 0);
    c.holder.rotation.set(0, i ? 0.3 : -0.35, 0);
    c.roll.rotation.x = 0;
    c.sh.position.set(CUP_X[i], 0.03, 0);
    c.sh.material.opacity = 0.7;
  });
  restCups();
  const cupHit = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 3, 10), new THREE.MeshBasicMaterial({ visible: false }));
  cupGroup.add(cupHit);

  /** 掷一对筊：res.flat = [boolean, boolean]（true 为平面朝上）。返回一个在落定后 resolve 的 Promise */
  function toss(res, dur = 1250) {
    const T = dur / 1000;
    const plan = cups.map((c, i) => {
      const spins = 2 + Math.floor(trueRandom() * 3);
      return {
        c,
        x0: CUP_X[i] * 0.4 + (trueRandom() - 0.5) * 2, z0: 5.5 + trueRandom() * 2, y0: 7, // 出手的位置不能在桌沿之外（落点在筊杯组的 z 上，组在桌子中前部）
        x1: CUP_X[i] + (trueRandom() - 0.5) * 1.8, z1: (trueRandom() - 0.5) * 2.6,
        rx1: spins * Math.PI * 2 + (res.flat[i] ? Math.PI : 0),
        ry0: trueRandom() * 3, ry1: (trueRandom() - 0.5) * 1.4 + (i ? 0.3 : -0.35),
        apex: 9 + trueRandom() * 3,
      };
    });
    return new Promise((resolve) => {
      let t = 0;
      desk.addTicker((dt) => {
        t += dt;
        const u = clamp(t / T, 0, 1);
        const air = clamp(u / 0.64, 0, 1); // 前 64% 在空中
        const tail = clamp((u - 0.64) / 0.36, 0, 1); // 之后落地弹两下
        for (const p of plan) {
          const x = p.x0 + (p.x1 - p.x0) * air;
          const z = p.z0 + (p.z1 - p.z0) * air;
          let y = p.y0 * (1 - air) + p.apex * 4 * air * (1 - air) * 1.0;
          if (tail > 0) y = 1.9 * Math.abs(Math.sin(tail * Math.PI * 2.3)) * (1 - tail) ** 1.3;
          const rx = p.rx1 * (1 - (1 - air) ** 2.2);
          p.c.roll.rotation.x = rx;
          const lift = 1.25 * (1 - Math.cos(rx)) / 2;
          p.c.holder.position.set(x, y + lift, z);
          p.c.holder.rotation.y = p.ry0 + (p.ry1 - p.ry0) * air;
          p.c.sh.position.set(x, 0.03, z);
          p.c.sh.material.opacity = 0.7 * clamp(1 - y / 14, 0.15, 1);
        }
        if (u >= 1) { resolve(); return false; }
        return true;
      });
    });
  }

  // 物理还没起来的时候（首页、卷首）：签自然地插在筒里
  const idleList = Array.from({ length: N }, (_, i) => ({ x: 126 + (i * 68) / (N - 1), top: 64 + ((i * 37) % 44), tilt: ((i * 5) % 7) - 3, o: 0 }));
  view.reset(idleList);
  idleList.forEach((s, i) => {
    sticks[i].position.set((s.x - PX) * S, (PY - (s.top + STICK_LEN / 2)) * S, zOff[i]);
    sticks[i].rotation.z = -rad(s.tilt);
  });

  return {
    id: 'qian',
    group,
    hit: [hitMesh],
    radius: 9,
    view,
    cups: { group: cupGroup, toss, rest: restCups, hit: [cupHit] },
    /** 筒里的签放回去、飞出的签收起（再求一次） */
    reset() { lastSig = ''; },
  };
}
