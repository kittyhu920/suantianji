// 器物共用的小工具：车削体（LatheGeometry）的 uv 按高度重排、一池软圆点（烟、尘、火星）、把一组材质压暗成"未开卷"的样子。

import * as THREE from 'three';
import { paintPuff } from '../paint3d.js';

/** 车削体：pts 是 (半径, 高) 的折线（自下而上）；uv 的 v 改成按高度算（Lathe 默认按点序号算） */
export function lathe(pts, segs, H, phi = Math.PI * 2) {
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs, 0, phi);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, Math.min(1, Math.max(0, pos.getY(i) / H)));
  geo.computeVertexNormals();
  return geo;
}

/** 一池软圆点。emit 一次放一个；活着的圆点每帧由 tick(dt) 推进。返回 { emit, tick, alive } */
export function puffPool(desk, { max = 48, color = 0x4a4036, blending = THREE.NormalBlending } = {}) {
  const tex = desk.tex(paintPuff(), {});
  const group = new THREE.Group();
  const items = [];
  const free = [];
  for (let i = 0; i < max; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, depthWrite: false, blending });
    const s = new THREE.Sprite(m);
    s.visible = false;
    group.add(s);
    free.push(s);
  }
  return {
    group,
    get alive() { return items.length; },
    /** p: 位置；v: 速度；r0: 起始半径；grow: 半径每秒的增量；life: 秒；a: 起始不透明度 */
    emit({ x, y, z, vx = 0, vy = 0, vz = 0, r0 = 0.4, grow = 1, life = 1, a = 0.5, gravity = 0, drag = 0 }) {
      const s = free.pop();
      if (!s) return;
      s.position.set(x, y, z);
      s.scale.setScalar(r0 * 2);
      s.material.opacity = a;
      s.visible = true;
      items.push({ s, vx, vy, vz, r: r0, grow, life, age: 0, a, gravity, drag });
    },
    tick(dt, wind = 0) {
      for (let i = items.length - 1; i >= 0; i--) {
        const p = items[i];
        p.age += dt;
        if (p.age >= p.life) { p.s.visible = false; free.push(p.s); items.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx = (p.vx + wind * dt) * k; p.vy *= k; p.vz *= k;
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.s.position.z += p.vz * dt;
        p.r += p.grow * dt;
        p.s.scale.setScalar(p.r * 2);
        const u = p.age / p.life;
        p.s.material.opacity = p.a * Math.min(1, p.age * 6) * (1 - u) ** 1.5;
      }
      return items.length > 0;
    },
    clear() { for (const p of items) { p.s.visible = false; free.push(p.s); } items.length = 0; },
  };
}

/** 未开卷：把这件器物的所有材质往灰、往暗里压，再蒙一层灰尘的哑光。amount 0..1 */
export function dust(group, amount = 0.58) {
  const grey = new THREE.Color(0x6a655a);
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.userData.dusted || !m.color) continue;
      m.userData.dusted = true;
      m.userData.base = m.color.clone();
      m.color.lerp(grey, amount).multiplyScalar(0.62);
      if ('roughness' in m) m.roughness = Math.min(1, (m.roughness ?? 0.8) + 0.3);
      if ('metalness' in m) m.metalness *= 0.4;
      if ('clearcoat' in m) m.clearcoat = 0;
    }
  });
}
