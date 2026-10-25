// 桌上的器物（docs/DESIGN.md §5）：首页、卷首、仪式中是同一个 3D 物件，只是位姿不同。
//   home    摆在书面前，弧形排开；卷名写在器物前面桌上的一块小木签上；开卷的亮，未开卷的蒙灰、签是灰的
//   ritual  玩家进了某一卷：这一卷的器物走到桌面中前部、放大一些（像拿到面前），其余的收起
//   away    读命书、讲解页：全部收起
// 悬停：器物微微抬起、被灯照亮；点开卷的器物进那一卷。仪式中把指针变成"按住这件器物"（见各卷的 rig）。

import * as THREE from 'three';
import { paintTag } from '../paint3d.js';
import { buildQian } from './qian.js';
import { buildGua } from './gua.js';
import { buildBu } from './bu.js';
import { buildXing, buildNiao, buildLi, buildZi } from './static.js';
import { dust } from './common.js';

// 首页的位置（厘米，桌面坐标，z 向玩家）：书在桌子里侧中央，器物在它面前与两侧排成一弧
export const HOME = {
  xing: { x: -47, z: -20, ry: 0.25 },
  qian: { x: -31, z: 12, ry: 0 },
  niao: { x: -14, z: 25, ry: 0 },
  li: { x: 6, z: 28, ry: 0.15 },
  zi: { x: 26, z: 25, ry: 0 },
  gua: { x: 38, z: 12, ry: 0 },
  bu: { x: 46, z: -15, ry: -0.2 },
};
const TAG_DZ = { qian: 8.4, gua: 8.6, bu: 13.4, xing: 12, niao: 9, li: 9.5, zi: 9.5 };
// 仪式中：版面没给落脚处的屏（择域、问事……），器物停在桌子的一侧；版面给了落脚处的屏，器物走到那里，并放大一些（像拿到面前）
export const RITUAL = {
  qian: { x: -43, z: 14, s: 1 },
  gua: { x: 43, z: 13, s: 1 },
  bu: { x: 44, z: 8, s: 1 },
};
const HOME_S = { qian: 0.82, gua: 0.9, bu: 0.95, xing: 0.9, niao: 0.9, li: 0.95, zi: 0.95 };
export const BIG = { qian: 1.08, gua: 1.3, bu: 1.55 };
const BUILD = { qian: buildQian, gua: buildGua, bu: buildBu, xing: buildXing, niao: buildNiao, li: buildLi, zi: buildZi };

export function createPieces(desk, juans, { onOpen, onHover } = {}) {
  const { THREE: T } = desk;
  void T;
  const list = {};
  const tagTex = {};
  let mode = 'home';
  let activeId = null;
  let hoverId = null;

  for (const j of juans) {
    const build = BUILD[j.id];
    if (!build) continue;
    const piece = build(desk);
    piece.open = !!j.open;
    piece.juan = j;
    const wrap = new THREE.Group(); // 位姿加在外层，内层是器物自己的坐标
    wrap.add(piece.group);
    desk.root.add(wrap);
    if (piece.cups) desk.root.add(piece.cups.group);
    piece.wrap = wrap;
    const h = HOME[j.id];
    piece.pose = desk.poser(wrap, { x: h.x, z: h.z, ry: h.ry, s: HOME_S[j.id] ?? 1 });
    piece.pose.onMove = () => { wrap.visible = piece.pose.P.s > 0.02; };
    piece.lift = 0; // 悬停的抬起，0..1
    piece.glow = (v) => { piece.lift = v * 0.7; setLiftGlow(piece); desk.invalidate(); }; // 键盘焦点：亮起来
    // 灯下发亮：所有标准材质带一点暖色的自发光，悬停时拉起来
    piece.glows = [];
    piece.group.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && 'emissive' in m && !m.userData.glow) { m.userData.glow = true; piece.glows.push(m); }
      }
    });
    if (!piece.open) dust(piece.group);
    for (const m of piece.hit) desk.register(m, piece, 'piece');

    // 小木签：卷名与全称（未开卷的灰、写"未开卷"）
    const tag = new THREE.Mesh(
      new THREE.BoxGeometry(10.6, 0.5, 3.3),
      [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial(i === 2
        ? { map: (tagTex[j.id] = desk.tex(paintTag({ name: j.name, title: j.title, closed: !j.open }))), roughness: 0.7 }
        : { color: j.open ? 0xb99d68 : 0x5a5547, roughness: 0.8 })),
    );
    tag.position.set(h.x, 0.25, h.z + TAG_DZ[j.id] * (HOME_S[j.id] ?? 1));
    tag.rotation.y = h.ry * 0.5 + (j.open ? 0.02 : -0.03);
    desk.shadowed(tag);
    desk.root.add(tag);
    piece.tag = tag;
    list[j.id] = piece;
  }
  desk.pieces = list;

  const setLiftGlow = (p) => {
    const e = p.lift;
    p.wrap.position.y = p.pose.P.y + e * 1.1;
    for (const m of p.glows) {
      if (!m.userData.glow0) m.userData.glow0 = m.emissive.clone();
      m.emissive.copy(m.userData.glow0).lerp(new THREE.Color(0x6a4a22), e * 0.8);
    }
  };

  let hoverTicker = null;
  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    onHover?.(id, id ? list[id] : null);
    if (!hoverTicker) {
      hoverTicker = desk.addTicker((dt) => {
        let more = false;
        for (const p of Object.values(list)) {
          const goal = p.juan.id === hoverId && mode === 'home' ? 1 : 0;
          const d = goal - p.lift;
          if (Math.abs(d) > 0.004) { p.lift += d * (1 - Math.exp(-dt * 11)); more = true; } else p.lift = goal;
          setLiftGlow(p);
        }
        if (!more) { hoverTicker = null; return false; }
        return true;
      });
    }
  }

  /* ───── 状态 ───── */
  function toHome(instant = false) {
    mode = 'home';
    activeId = null;
    for (const [id, p] of Object.entries(list)) {
      const h = HOME[id];
      p.wrap.visible = true;
      p.pose.to({ x: h.x, y: 0, z: h.z, ry: h.ry, s: HOME_S[id] ?? 1 }, 5, instant);
      p.tag.visible = true;
    }
    desk.invalidate();
  }
  function toRitual(id, instant = false) {
    mode = 'ritual';
    activeId = id;
    setHover(null);
    for (const [pid, p] of Object.entries(list)) {
      p.tag.visible = false;
      if (pid === id) {
        const r = RITUAL[id] ?? { x: 0, z: 14, s: 1 };
        p.wrap.visible = true;
        p.pose.to({ x: r.x, y: 0, z: r.z, ry: 0, s: r.s }, 4.5, instant);
      } else {
        const h = HOME[pid];
        p.pose.to({ x: h.x * 1.3, z: h.z, s: 0 }, 6, instant);
      }
    }
    desk.invalidate();
  }
  function toAway(instant = false) {
    mode = 'away';
    activeId = null;
    setHover(null);
    for (const [pid, p] of Object.entries(list)) {
      const h = HOME[pid];
      p.tag.visible = false;
      p.pose.to({ x: h.x, z: h.z, s: 0 }, 6, instant);
    }
    desk.invalidate();
  }
  /** 仪式中的器物被版面（桌上的位置）挪动：x、z 是桌面坐标 */
  function place(id, x, z, s) {
    const p = list[id];
    if (!p || mode !== 'ritual' || activeId !== id) return;
    p.pose.to({ x, z, s: s ?? BIG[id] ?? 1.3 }, 5);
  }
  /** 把某件器物放回首页的位置（掷筊时，签筒让到旁边） */
  function park(id, s = 1) {
    const p = list[id];
    if (!p) return;
    const h = HOME[id];
    p.pose.to({ x: h.x * 0.9, z: h.z + 4, ry: 0, s }, 4.5);
  }

  /* ───── 指针 ───── */
  const cv = desk.canvas;
  let downId = null;
  let capture = null;
  const homeTargets = (m) => !!m.userData.owner;
  function pickHome(e) {
    const h = desk.pick(e.clientX, e.clientY, homeTargets);
    return h ? h.object.userData.owner : null;
  }
  const ritualTargets = (m) => m.userData.owner?.juan.id === activeId;
  function pickRitual(e) {
    return desk.pick(e.clientX, e.clientY, ritualTargets);
  }
  function onDown(e) {
    if (e.button > 0) return;
    if (mode === 'home') {
      const p = pickHome(e);
      downId = p?.juan.id ?? null;
      return;
    }
    if (mode !== 'ritual') return;
    const h = pickRitual(e);
    if (!h) return;
    const p = h.object.userData.owner;
    const target = p.proxy?.(h.object);
    if (!target) return;
    e.preventDefault();
    cv.setPointerCapture?.(e.pointerId);
    capture = { target, id: e.pointerId };
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, button: 0, buttons: 1, pointerType: e.pointerType }));
  }
  function onMove(e) {
    if (capture) {
      // 画布仍持有指针时（目标没能接过去），自己转发
      if (cv.hasPointerCapture?.(e.pointerId)) capture.target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, movementX: e.movementX, movementY: e.movementY }));
      return;
    }
    if (mode === 'home') {
      const p = pickHome(e);
      setHover(p?.juan.id ?? null);
      cv.style.cursor = p ? (p.open ? 'pointer' : 'default') : '';
    } else if (mode === 'ritual') {
      cv.style.cursor = pickRitual(e) ? 'grab' : '';
    }
  }
  function onUp(e) {
    if (capture) {
      if (cv.hasPointerCapture?.(e.pointerId)) capture.target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }));
      capture = null;
      return;
    }
    if (mode === 'home' && downId) {
      const p = pickHome(e);
      if (p && p.juan.id === downId && p.open) onOpen?.(p.juan);
    }
    downId = null;
  }
  function onLeave() { if (!capture) setHover(null); }
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('pointerleave', onLeave);

  return {
    list, setHover, toHome, toRitual, toAway, place, park,
    get mode() { return mode; },
    get active() { return activeId ? list[activeId] : null; },
    get hoverId() { return hoverId; },
    /** 键盘焦点等同悬停 */
    focus(id) { if (mode === 'home') setHover(id); },
    destroy() {
      cv.removeEventListener('pointerdown', onDown);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp);
      cv.removeEventListener('pointercancel', onUp);
      cv.removeEventListener('pointerleave', onLeave);
    },
  };
}
