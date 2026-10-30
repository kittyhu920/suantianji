// 器物共用的小工具：车削体（LatheGeometry）的 uv 按高度重排、一池软圆点（烟、尘、火星）、把一组材质压暗成"未开卷"的样子。

import * as THREE from 'three';
import { paintPuff, canvas } from '../paint3d.js';

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

/**
 * 桌面上的墨点（贴花）：一团主墨加几粒溅出去的小点，落下时略洇开，然后慢慢淡去（life 毫秒）。
 * splat(x, z, n) 在桌面（本组坐标）的 (x, z) 附近撒 n 个；clear() 立刻收掉。淡去用低频的小步，不占满每一帧。
 */
export function inkDots(desk, { max = 6, life = 9000 } = {}) {
  const cv = canvas(128, 128);
  const g = cv.getContext('2d');
  const blob = (x, y, r, a) => {
    const gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  };
  blob(64, 64, 34, 1);
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.4; const d = 38 + (i * 13) % 17; blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 5 + (i * 7) % 6, 0.95); }
  blob(52, 58, 12, 1); blob(78, 72, 10, 1);
  const map = desk.tex(cv, {});
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  const dots = [];
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map, color: 0x120d08, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    m.visible = false;
    group.add(m);
    dots.push({ m, t0: 0, size: 1, a0: 0.85 });
  }
  let timer = 0;
  const step = () => {
    const now = performance.now();
    let alive = false;
    for (const d of dots) {
      if (!d.m.visible) continue;
      const age = now - d.t0;
      if (age >= life) { d.m.visible = false; continue; }
      alive = true;
      const grow = 1 + 0.28 * (1 - Math.exp(-age / 350)); // 落纸后略洇开
      d.m.scale.set(d.size * grow, d.size * grow, 1);
      d.m.material.opacity = d.a0 * (1 - Math.pow(age / life, 1.6));
    }
    desk.invalidate();
    timer = alive ? setTimeout(step, age60()) : 0;
  };
  // 刚落下的头半秒要细一点（洇开），之后每 250ms 一步就看不出台阶
  const age60 = () => (performance.now() - (dots.reduce((a, d) => Math.max(a, d.t0), 0)) < 600 ? 40 : 250);
  return {
    group,
    splat(x, z, n = 4) {
      const now = performance.now();
      let k = 0;
      for (const d of dots) {
        if (k >= n) break;
        if (d.m.visible && now - d.t0 < life * 0.5) continue;
        const main = k === 0;
        d.size = main ? 3.4 + Math.random() * 1.0 : 1.4 + Math.random() * 1.3;
        d.a0 = main ? 0.9 : 0.8;
        d.t0 = now;
        d.m.position.set(x + (main ? 0 : (Math.random() - 0.5) * 11), 0.045 + k * 0.002, z + (main ? 0 : (Math.random() - 0.5) * 8));
        d.m.rotation.z = Math.random() * Math.PI * 2;
        d.m.scale.set(d.size, d.size, 1);
        d.m.material.opacity = d.a0;
        d.m.visible = true;
        k++;
      }
      clearTimeout(timer);
      step();
    },
    clear() { clearTimeout(timer); timer = 0; for (const d of dots) d.m.visible = false; desk.invalidate(); },
  };
}

/** 未开卷：把这件器物的所有材质往灰、往暗里压，再蒙一层灰尘的哑光。amount 0..1 */
export function dust(group, amount = 0.72) { // 未开卷的器物整体压暗、去饱和（颜色，不加遮罩）；悬停时 pieces/index.js 的 setLiftGlow 把它照亮
  const grey = new THREE.Color(0x6a655a);
  group.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.userData.dusted || !m.color) continue;
      m.userData.dusted = true;
      m.userData.base = m.color.clone();
      m.color.lerp(grey, amount).multiplyScalar(0.5);
      if ('roughness' in m) m.roughness = Math.min(1, (m.roughness ?? 0.8) + 0.3);
      if ('metalness' in m) m.metalness *= 0.4;
      if ('clearcoat' in m) m.clearcoat = 0;
    }
  });
}
