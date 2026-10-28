// 龟壳与三枚铜钱（卦卷的器物，docs/DESIGN.md §5）：背甲做的壳（六边盾片、琥珀与深褐的斑），三枚旧铜钱（方孔、锈色、磨亮的边）。
// 摇卦的物理在 src/juan/gua/shell.js（侧视的二维物理）；这里是它的 3D 表现：壳绕壳底倾、壳里的钱跳动、倒出来的钱飞落到桌上、
// 翻几个半圈、摇摆着停下（朝向在出手那一刻就定了，物理只负责看起来对）。铜钱是真实的小：直径 3 厘米。

import * as THREE from 'three';
import { paintCoin, paintShellBack } from '../paint3d.js';
import { lathe, puffPool } from './common.js';
import { trueRandom } from '../../rng.js';

const S = 0.078; // 物理的一个像素，对应多少厘米
const PX = 160;
const PY = 262;
const RIM = 162;
const REST = 392;
const MOUTH = (PY - (RIM + 8)) * S; // 壳口的高度（厘米）
const HSH = (PY - RIM) * S * 0.72; // 壳高（比二维里矮一些，从俯视的机位看得到壳里的钱）
const RM = ((238 - 82) / 2) * S; // 壳口半径
const CR = 1.5; // 铜钱半径（厘米）
const CD = 0.16; // 铜钱厚度
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function coinGeometry() {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, CR, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  const h = 0.3;
  hole.moveTo(-h, -h); hole.lineTo(-h, h); hole.lineTo(h, h); hole.lineTo(h, -h); hole.closePath();
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: CD, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.04, bevelSegments: 2, curveSegments: 32 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -CD / 2, 0);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const ny = nor.getY(i);
    if (ny > 0.5) uv.setXY(i, 0.25 + x / (4 * CR), 0.5 - z / (2 * CR));
    else if (ny < -0.5) uv.setXY(i, 0.75 + x / (4 * CR), 0.5 + z / (2 * CR));
    else uv.setXY(i, 0.02, 0.5);
  }
  return g;
}

export function buildGua(desk) {
  const group = new THREE.Group();
  const tiltG = new THREE.Group(); // 壳口微微朝向玩家：从俯视的机位看得到壳里的钱
  tiltG.rotation.x = 0.22;
  group.add(tiltG);
  const rig = new THREE.Group();
  tiltG.add(rig);

  // ───── 壳 ─────
  const sh = paintShellBack();
  const shellMap = desk.tex(sh.color, { wrap: true });
  const shellBump = desk.tex(sh.bump, { srgb: false, wrap: true });
  const prof = [[0.001, 0.12], [2.2, 0.12], [3.2, 0.5]];
  for (let k = 1; k <= 14; k++) {
    const y = 0.5 + ((HSH - 0.5) * k) / 14;
    const u = (y - 0.5) / (HSH - 0.5);
    prof.push([3.2 + (RM - 3.2) * Math.sin((u * Math.PI) / 2) ** 0.9, y]);
  }
  prof.push([RM + 0.15, HSH + 0.05], [RM - 0.05, HSH + 0.18], [RM - 0.55, HSH + 0.1]);
  const body = new THREE.Mesh(
    lathe(prof, 60, HSH),
    new THREE.MeshPhysicalMaterial({ map: shellMap, bumpMap: shellBump, bumpScale: 1.3, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  );
  body.rotation.y = Math.PI;
  const bowl = new THREE.Mesh(
    lathe([[RM - 0.55, HSH + 0.1], [RM - 0.7, HSH - 0.2], [RM - 1.2, 1.6], [3.0, 0.9], [0.001, 0.8]], 40, HSH),
    new THREE.MeshStandardMaterial({ map: shellMap, color: 0x7a5a3a, roughness: 0.6, side: THREE.DoubleSide }),
  );
  body.scale.z = bowl.scale.z = 1.26; // 背甲是椭圆的（前后比左右长），不是一只圆碗
  rig.add(body, bowl);

  // ───── 钱 ─────
  const cm = paintCoin();
  const coinMat = new THREE.MeshStandardMaterial({
    map: desk.tex(cm.color), bumpMap: desk.tex(cm.bump, { srgb: false }), bumpScale: 1.2, roughness: 0.46, metalness: 0.72,
  });
  const coinGeo = coinGeometry();
  const coins = [0, 1, 2].map((i) => {
    const holder = new THREE.Group();
    const flip = new THREE.Group();
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    flip.add(mesh);
    holder.add(flip);
    desk.shadowed(holder);
    group.add(holder);
    const shd = desk.blob(CR * 3.0, CR * 3.0, 0.55);
    shd.visible = false;
    group.add(shd);
    return { holder, flip, shd, zLand: 8 + i * 0.4 + trueRandom() * 2.5 };
  });
  const insideZ = [-1.5, 0.1, 1.5];

  const contact = desk.blob(RM * 2.8, RM * 2.8, 0.8);
  group.add(contact);
  desk.shadowed(rig);
  bowl.castShadow = false;
  const hitMesh = new THREE.Mesh(new THREE.SphereGeometry(RM + 0.8, 14, 10), new THREE.MeshBasicMaterial({ visible: false }));
  hitMesh.position.y = HSH * 0.5;
  group.add(hitMesh);
  const dustPool = puffPool(desk, { max: 24, color: 0x8a7a60 });
  group.add(dustPool.group);

  let lastSig = '';
  let simT = 0;
  let t0 = 0;
  let flyT1 = [0.5, 0.5, 0.5];
  const height = (y) => (y >= RIM + 8 ? (REST - y) * (MOUTH / (REST - RIM - 8)) : MOUTH + (RIM + 8 - y) * S);
  const lift = (th) => CR * Math.abs(Math.sin(th)) + (CD / 2) * Math.abs(Math.cos(th));

  const view = {
    toX(clientX) {
      const r = desk.rect;
      const o = group.getWorldPosition(new THREE.Vector3());
      const a = desk.project(o);
      const b = desk.project(o.clone().add(new THREE.Vector3(1, 0, 0)));
      return PX + ((clientX - r.left - a.x) / Math.max(1e-3, b.x - a.x) / group.scale.x) / S;
    },
    reset() {
      coins.forEach((c) => { c.holder.visible = true; c.shd.visible = false; });
      rig.rotation.z = 0;
      dustPool.clear();
      lastSig = '';
    },
    launch(st) {
      t0 = simT;
      flyT1 = [0.55, 0.55, 0.55];
      coins.forEach((c) => { c.zLand = 7 + trueRandom() * 4; c.shd.visible = true; });
    },
    done() { lastSig = ''; },
    /** 卦成：最后一爻落定时，三枚铜钱轻轻一颤（各自微微跳起、转一点点，很快停稳），约 0.6 秒 */
    shiver() {
      const base = coins.map((c) => ({ y: c.holder.position.y, ry: c.holder.rotation.y, rx: c.flip.rotation.x }));
      let t = 0;
      desk.addTicker((dt) => {
        t += dt;
        const u = clamp(t / 0.62, 0, 1);
        const decay = (1 - u) ** 2;
        coins.forEach((c, i) => {
          const ph = t * 46 + i * 1.7;
          c.holder.position.y = base[i].y + 0.16 * decay * Math.abs(Math.sin(ph));
          c.holder.rotation.y = base[i].ry + 0.05 * decay * Math.sin(ph * 0.9);
          c.flip.rotation.x = base[i].rx + 0.04 * decay * Math.sin(ph * 1.1 + 1);
        });
        if (u >= 1) {
          coins.forEach((c, i) => { c.holder.position.y = base[i].y; c.holder.rotation.y = base[i].ry; c.flip.rotation.x = base[i].rx; });
          return false;
        }
        return true;
      });
    },
    burst(x, y, power) {
      const i = Math.max(0, Math.min(2, Math.round((x - 68) / 92)));
      void i;
      const wx = (x - PX) * S;
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI * (0.1 + 0.8 * trueRandom());
        const sp = (2 + 5 * trueRandom()) * (0.5 + power);
        dustPool.emit({ x: wx + (trueRandom() - 0.5) * 2, y: 0.25, z: 10 + (trueRandom() - 0.5) * 3, vx: Math.cos(a) * sp * 0.6, vy: Math.abs(Math.sin(a)) * sp * 0.4, vz: (trueRandom() - 0.4) * 2, r0: 0.2 + trueRandom() * 0.25, grow: 1.2, life: 0.4 + trueRandom() * 0.4, a: 0.3, gravity: -10, drag: 2 });
      }
    },
    tick(dt) { simT += dt; dustPool.tick(dt); },
    draw(st, inside) {
      rig.rotation.z = -rad(st.a);
      let sig = `${st.a.toFixed(2)}|${st.energy.toFixed(2)}|${dustPool.alive}`;
      if (st.phase === 'shake') {
        coins.forEach((c, i) => {
          const s = inside[i];
          c.holder.parent !== rig && rig.add(c.holder);
          c.holder.position.set(s.dx * S, 1.15 - s.o * S + st.energy * 0.5, insideZ[i]);
          c.holder.rotation.y = rad(s.z);
          c.flip.rotation.x = s.th * 0.7;
          c.shd.visible = false;
          sig += `|${s.o.toFixed(1)}`;
        });
      } else if (st.coins) {
        st.coins.forEach((cc, i) => {
          const c = coins[i];
          c.holder.parent !== group && group.add(c.holder);
          const age = simT - t0;
          const pz = clamp(age / (cc.T1 ?? 0.55), 0, 1);
          const z = c.zLand * (1 - (1 - pz) ** 2);
          const h = height(cc.y);
          c.holder.position.set((cc.x - PX) * S, h + lift(cc.th), z);
          c.holder.rotation.y = rad(cc.z);
          c.flip.rotation.x = cc.th;
          c.shd.position.set((cc.x - PX) * S, 0.03, z);
          c.shd.material.opacity = 0.6 * clamp(1 - h / 16, 0.1, 1);
          sig += `|${cc.x.toFixed(1)}|${cc.y.toFixed(1)}|${cc.th.toFixed(2)}`;
        });
      }
      if (sig === lastSig) return;
      lastSig = sig;
      desk.frameNow();
    },
  };

  // 物理还没起来的时候：三枚钱躺在壳里
  coins.forEach((c, i) => {
    rig.add(c.holder);
    c.holder.position.set((i - 1) * 3.0 * 0.9, 0.95 + (i === 1 ? 0.18 : 0), (i - 1) * 1.2);
    c.holder.rotation.y = (i - 1) * 0.9;
    c.flip.rotation.x = [0.5, 0.15, 0.8][i];
  });

  // 摆放：首页里壳口朝下扣在桌上，露出整个背甲（盾片纹与拱起的弧度，从俯视的机位才看得出是龟壳，不是碗）；
  // 进卷后翻过来，壳口朝上、略朝玩家，里面是三枚钱
  let tiltA = Math.PI;
  let tiltStop = null;
  const UP = 0.22;
  const applyTilt = (a) => {
    tiltA = a;
    tiltG.rotation.x = a;
    tiltG.position.y = (HSH + 0.25) * clamp((a - UP) / (Math.PI - UP), 0, 1);
    tiltG.position.z = -0.6 * Math.sin(a);
  };
  function rest(down, instant = false) {
    const goal = down ? Math.PI : UP;
    tiltStop?.();
    tiltStop = null;
    if (instant) { applyTilt(goal); desk.invalidate(); return; }
    if (Math.abs(goal - tiltA) < 1e-3) return;
    const from = tiltA;
    let t = 0;
    tiltStop = desk.addTicker((dt) => {
      t += dt;
      const u = clamp(t / 0.8, 0, 1);
      const e = u * u * (3 - 2 * u);
      applyTilt(from + (goal - from) * e);
      // 翻起来时壳略抬一点，免得壳沿陷进桌面
      group.position.y = Math.sin(e * Math.PI) * 2.2;
      if (u >= 1) { group.position.y = 0; tiltStop = null; return false; }
      return true;
    });
  }
  applyTilt(Math.PI);

  return { id: 'gua', group, hit: [hitMesh], radius: 9, view, rest, reset() { view.reset(); } };
}
