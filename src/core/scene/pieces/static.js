// 暗着摆的几件器物（星盘、鸟笼、历书、砚与笺）：还没开卷，不能交互；有真实的尺度与材质，蒙着一层灰。
// 每件只是几何体加程序化材质，不用外部模型文件。

import * as THREE from 'three';
import { paintAstrolabe, paintAlmanac, paintSlate, paintPaper, paintEdge, canvas } from '../paint3d.js';
import { dust } from './common.js';

const hitBox = (w, h, d, y = h / 2) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.position.y = y;
  return m;
};

/** 星盘：漆木的底座，一块铜盘斜靠在楔子上，刻度用细线，一根指针 */
export function buildXing(desk) {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xb98a46, roughness: 0.38, metalness: 0.85 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x23160e, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.3 });
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 4), lacquer);
  wedge.position.set(0, 0.6, 5.5);
  const tilt = new THREE.Group();
  tilt.position.set(0, 1.6, 0);
  tilt.rotation.x = -0.32; // 盘面朝向玩家
  const a = paintAstrolabe();
  const faceMat = new THREE.MeshStandardMaterial({ map: desk.tex(a.color), bumpMap: desk.tex(a.bump, { srgb: false }), bumpScale: 0.9, roughness: 0.4, metalness: 0.7 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.4, 0.4, 56), [brass, faceMat, brass]);
  disc.position.y = 0;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.28, 8, 56), brass);
  rim.rotation.x = Math.PI / 2;
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.16, 8, 20), brass);
  ringTop.position.set(0, 0, -9.4);
  ringTop.rotation.x = Math.PI / 2;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 15.5), brass);
  arm.position.set(0, 0.32, 0);
  arm.rotation.y = 0.66;
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 12), brass);
  pin.position.y = 0.36;
  tilt.add(disc, rim, ringTop, arm, pin);
  g.add(wedge, tilt);
  desk.shadowed(g);
  g.add(desk.blob(19, 19, 0.75));
  g.add(hitBox(16, 8, 17, 4));
  const hit = g.children[g.children.length - 1];
  dust(g);
  return { id: 'xing', group: g, hit: [hit], radius: 9 };
}

/** 鸟笼：竹篾的笼，一只鸟 */
export function buildNiao(desk) {
  const g = new THREE.Group();
  const wire = new THREE.MeshStandardMaterial({ color: 0xa7814a, roughness: 0.55, metalness: 0.2 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.8, 0.8, 32), new THREE.MeshStandardMaterial({ color: 0x4a3016, roughness: 0.6 }));
  base.position.y = 0.4;
  g.add(base);
  const H = 14;
  const prof = (y) => 5.1 * (1 - 0.82 * Math.pow(y / H, 2.4)) + 0.6;
  for (let i = 0; i < 18; i++) {
    const phi = (i / 18) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 12; k++) { const y = 0.8 + ((H - 0.8) * k) / 12; const r = prof(y - 0.8); pts.push(new THREE.Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.08, 5, false), wire));
  }
  for (const y of [4, 8.6]) {
    const r = prof(y - 0.8);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 5, 40), wire);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    g.add(t);
  }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 6, 20), wire);
  hook.position.y = H + 0.6;
  g.add(hook);
  // 鸟：灰褐的一团
  const bird = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: 0x6f6a5c, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), bm);
  body.scale.set(1, 0.9, 1.25);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), bm);
  head.position.set(0, 0.9, 1.1);
  bird.add(body, head);
  bird.position.set(0, 2.5, 0);
  g.add(bird);
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6, 6), wire);
  perch.rotation.z = Math.PI / 2;
  perch.position.y = 1.9;
  g.add(perch);
  desk.shadowed(g);
  g.add(desk.blob(15, 15, 0.7));
  const hit = hitBox(12, 16, 12, 8);
  g.add(hit);
  dust(g);
  return { id: 'niao', group: g, hit: [hit], radius: 8 };
}

/** 历书：一本窄长的册子，封面素纸、黑色签条、方格 */
export function buildLi(desk) {
  const g = new THREE.Group();
  const cover = desk.tex(paintAlmanac());
  const edgeTex = desk.tex(paintEdge(), {});
  edgeTex.wrapS = edgeTex.wrapT = THREE.RepeatWrapping;
  edgeTex.repeat.set(1, 6);
  const paper = new THREE.MeshStandardMaterial({ map: cover, roughness: 0.92 });
  const side = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95, color: 0xd9ceb0 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.85 });
  const block = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.7, 12.2), [side, mid, paper, side, side, side]);
  block.position.y = 0.85;
  g.add(block);
  // 订口的一道黑布
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 12.3), mid);
  spine.position.set(-4.5, 0.9, 0);
  g.add(spine);
  desk.shadowed(g);
  g.add(desk.blob(13, 16, 0.7));
  g.rotation.y = 0.2;
  const hit = hitBox(10, 3, 13.5, 1.5);
  g.add(hit);
  dust(g);
  return { id: 'li', group: g, hit: [hit], radius: 7 };
}

/** 砚与笺：一方石砚、一锭墨、一支笔、一张写着字的纸 */
export function buildZi(desk) {
  const g = new THREE.Group();
  const slate = desk.tex(paintSlate(), {});
  const stone = new THREE.MeshStandardMaterial({ map: slate, roughness: 0.55 });
  const inkstone = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.5, 5.8), stone);
  inkstone.position.set(-3, 0.75, 0.6);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.12, 28), new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.12, metalness: 0.2 }));
  pond.position.set(-3.7, 1.52, 0.6);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 4.6), new THREE.MeshStandardMaterial({ color: 0x0e0d0b, roughness: 0.5 }));
  stick.position.set(0.4, 0.35, 5.4);
  stick.rotation.y = 0.35;
  const brushMat = new THREE.MeshStandardMaterial({ color: 0x6d4a26, roughness: 0.6 });
  const brush = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 12.5, 10), brushMat);
  shaft.rotation.z = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 10), new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 0.9 }));
  tip.rotation.z = Math.PI / 2;
  tip.position.x = 7.3;
  brush.add(shaft, tip);
  brush.position.set(-2.2, 1.0, -4.6);
  brush.rotation.y = 0.18;
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 2.4), brushMat);
  rest.position.set(-5.6, 0.45, -4.4);
  // 纸：一个字
  const pcv = paintPaper({ w: 384, h: 512, seed: 12 });
  const pg = pcv.getContext('2d');
  pg.fillStyle = 'rgba(27,23,18,.88)';
  pg.font = '300px "Huiwen-mincho","Noto Serif SC",serif';
  pg.textAlign = 'center';
  pg.textBaseline = 'middle';
  pg.fillText('丁', 192, 270);
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 9), new THREE.MeshStandardMaterial({ map: desk.tex(pcv), roughness: 0.95 }));
  sheet.position.set(5.2, 0.03, -0.4);
  sheet.rotation.y = -0.22;
  g.add(inkstone, pond, stick, brush, rest, sheet);
  desk.shadowed(g);
  g.add(desk.blob(20, 15, 0.7));
  const hit = hitBox(18, 3, 13, 1.5);
  g.add(hit);
  dust(g);
  void canvas;
  return { id: 'zi', group: g, hit: [hit], radius: 9 };
}
