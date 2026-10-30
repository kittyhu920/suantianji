// 龟腹甲（卜卷的器物，docs/DESIGN.md §5、§15）：一块有厚度的骨甲，背面凿好六处钻凿（运行时画的纹理），正面是兆。
// 灼：按住一处，一根炭条斜着抵在那里，尖端渐红，赭红的光映在骨上，烟升起来；"卜"的一声，甲翻过来，正面的兆纹一道道裂开（还是 Canvas 画的，贴在甲上）。
// 逻辑（热度、时长、兆象）仍在 src/juan/bu/game.svelte.js 与 crack.js，这里只管 3D 的样子，与把指针变成"按住第几处"。

import * as THREE from 'three';
import { paintPlastronBack, paintPuff, canvas } from '../paint3d.js';
import { puffPool } from './common.js';
import { SPOTS, cnNum } from '../../../juan/bu/data.js';
import { PLASTRON_D, paintShell, paintCracks, spotPos, FIG_W, FIG_H } from '../../../juan/bu/shell.js';
import { trueRandom } from '../../rng.js';

const K = 0.052; // 背面坐标一个单位对应多少厘米
const T = 0.8; // 甲的厚度
const CX = 150;
const CY = 211;
const HEAT = new THREE.Color(0xd2703c);
const AFTER = 1800; // 出兆的暖光峰值（candela）

/** 把 'M x y C … Z'（只含 M、C、Z 的绝对坐标）的路径读成 Shape */
function shapeFromPath(d) {
  const nums = d.match(/[MCZ]|-?\d+\.?\d*/g);
  const sh = new THREE.Shape();
  for (let i = 0; i < nums.length;) {
    const c = nums[i++];
    if (c === 'M') sh.moveTo(+nums[i++], +nums[i++]);
    else if (c === 'C') sh.bezierCurveTo(+nums[i++], +nums[i++], +nums[i++], +nums[i++], +nums[i++], +nums[i++]);
  }
  return sh;
}

function faceGeometry(shape, top) {
  const g = new THREE.ShapeGeometry(shape, 24);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const nor = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setXYZ(i, (x - CX) * K, 0, (y - CY) * K);
    uv.setXY(i, top ? x / 300 : 1 - x / 300, 1 - y / 420);
    nor.setXYZ(i, 0, top ? 1 : -1, 0);
  }
  if (top) { // 反过来：映射把手性翻了，顶面的三角形要反绕才朝上
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  return g;
}

function wallGeometry(shape) {
  const pts = shape.getPoints(96);
  const pos = [];
  const idx = [];
  pts.forEach((q, i) => {
    const x = (q.x - CX) * K;
    const z = (q.y - CY) * K;
    pos.push(x, T / 2, z, x, -T / 2, z);
    const j = (i + 1) % pts.length;
    idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBu(desk) {
  const group = new THREE.Group();
  const flipper = new THREE.Group(); // 翻面绕长轴（z）转
  group.add(flipper);
  flipper.position.y = T / 2; // 转轴在甲的正中，翻过来才不会陷进桌面
  const lifter = new THREE.Group();
  flipper.add(lifter);

  const shape = shapeFromPath(PLASTRON_D);
  // 翻面时甲绕长轴转，转到竖起来（90°）时一侧的边会扎进桌面：整块甲随转角抬起半宽乘 sin，最低的边始终落在桌面上
  const halfW = Math.max(...shape.getPoints(48).map((q) => Math.abs((q.x - CX) * K)));
  const liftFor = () => halfW * Math.abs(Math.sin(flipper.rotation.z));
  const backCv = canvas(600, 840);
  const frontCv = canvas(600, 840);
  const frontBg = canvas(600, 840);
  const used = SPOTS.map(() => false);
  const paintBack = () => paintPlastronBack(backCv, { spots: SPOTS, used, seed: 51, cn: cnNum });
  paintBack();
  const backTex = desk.tex(backCv);
  const frontTex = desk.tex(frontCv);
  const bone = (map) => new THREE.MeshStandardMaterial({ map, color: 0xc4baa6, roughness: 0.6, bumpMap: map, bumpScale: 0.35 });
  const topMesh = new THREE.Mesh(faceGeometry(shape, true), bone(backTex));
  topMesh.position.y = T / 2;
  const botMesh = new THREE.Mesh(faceGeometry(shape, false), bone(frontTex));
  botMesh.position.y = -T / 2;
  const wall = new THREE.Mesh(wallGeometry(shape), new THREE.MeshStandardMaterial({ color: 0xa28e66, roughness: 0.8, side: THREE.DoubleSide }));
  lifter.add(topMesh, botMesh, wall);
  desk.shadowed(lifter);
  const contact = desk.blob(18, 25, 0.8);
  group.add(contact);

  // 拾取：每一处钻凿一个看不见的圆柱
  const spotWorld = (i) => new THREE.Vector3((SPOTS[i].x - CX) * K, T / 2 + 0.02, (SPOTS[i].y - CY) * K);
  const hits = SPOTS.map((s, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 10), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.copy(spotWorld(i));
    m.userData.spot = i;
    lifter.add(m);
    return m;
  });
  const bodyHit = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.4, 21.8), new THREE.MeshBasicMaterial({ visible: false }));
  bodyHit.position.y = 0;
  lifter.add(bodyHit);

  // 炭条、火光、烟
  const coal = new THREE.Group();
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1c1814, roughness: 0.85, emissive: HEAT.clone(), emissiveIntensity: 0 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 7.2, 10), coalMat);
  stick.position.y = 3.6;
  coal.add(stick);
  coal.visible = false;
  desk.shadowed(coal);
  lifter.add(coal);
  const emberMat = new THREE.SpriteMaterial({ map: desk.tex(paintPuff(), {}), color: HEAT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const ember = new THREE.Sprite(emberMat);
  ember.visible = false;
  lifter.add(ember);
  const emberLight = new THREE.PointLight(0xd2703c, 0, 16, 2);
  lifter.add(emberLight);
  // 出兆的余光：裂纹长出来时甲面泛暖，裂完之后慢慢收住
  const afterLight = new THREE.PointLight(0xd2703c, 0, 22, 2);
  afterLight.position.set(0, 6, 0);
  group.add(afterLight); // 挂在器物上、不挂在会翻转的甲上：以前挂在甲上，翻过来之后灯跑到了甲的下面（桌面里），光几乎照不到甲面
  let afterStop = null;
  const fadeAfter = (ms = 1000) => {
    afterStop?.();
    const from = afterLight.intensity;
    let t = 0;
    afterStop = desk.addTicker((dt) => {
      t += dt * 1000;
      const u = Math.min(1, t / ms);
      afterLight.intensity = from * (1 - u) ** 2;
      if (u >= 1) { afterLight.intensity = 0; afterStop = null; return false; }
      return true;
    });
  };
  const smoke = puffPool(desk, { max: 56, color: 0x3a342e });
  group.add(smoke.group);
  // 键盘焦点的圈
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.7, 36), new THREE.MeshBasicMaterial({ color: 0xf4ecd6, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  lifter.add(ring);

  /* ───── 灼卜时镜头推近（docs/DESIGN.md §15）───── */
  // 按住钻凿、火开始红的时候，镜头推近到龟甲，桌子其余部分与字盘压暗，一束光照在甲上；兆裂完停 0.6 秒让人看清，再退回仪式机位。
  // 推近与压暗在 desk3d.js 的 focusTo；这里只管什么时候开始、什么时候结束
  let focused = false;
  const focusSpec = () => {
    group.parent?.updateMatrixWorld(true);
    const c = group.getWorldPosition(new THREE.Vector3());
    const sc = group.parent?.scale.x ?? 1;
    const pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(new THREE.Vector3(c.x + sx * 8 * sc, 0.5, c.z + sz * 11.2 * sc));
    return { pts, elev: (66 * Math.PI) / 180 };
  };
  const focusOn = () => { if (focused) return; focused = true; desk.focusTo(focusSpec(), { ms: 850 }); };
  const focusOff = (ms = 900, instant = false) => { if (!focused) return; focused = false; desk.focusTo(null, { ms, instant }); };

  /* ───── 状态：热度与已用的钻凿 ───── */
  let active = -1;
  let heat = 0;
  let smokeTicker = null;
  let wind = 0;
  let acc = 0;
  const base = new THREE.Vector3();
  const applyCoal = () => {
    if (active < 0 || heat <= 0.02) { coal.visible = false; ember.visible = false; emberLight.intensity = 0; return; }
    const s = SPOTS[active];
    const sx = s.x < CX ? -1 : 1; // 远离中缝的那一侧
    base.copy(spotWorld(active));
    coal.visible = ember.visible = true;
    coal.position.copy(base);
    // 炭条从钻凿处斜着向外上方伸出去
    coal.rotation.set(0, 0, 0);
    coal.rotation.z = -sx * 0.88;
    coal.rotation.x = -0.35;
    coalMat.emissiveIntensity = 0.1 + 1.6 * heat;
    ember.position.copy(base).add(new THREE.Vector3(0, 0.15, 0));
    ember.scale.setScalar(1.8 + 5.2 * heat);
    emberMat.opacity = 0.2 + 0.7 * heat;
    emberLight.position.copy(base).add(new THREE.Vector3(0, 1.6, 0));
    emberLight.intensity = 90 * heat * heat;
  };
  function ensureSmoke() {
    if (smokeTicker) return;
    smokeTicker = desk.addTicker((dt) => {
      wind = Math.sin(performance.now() * 0.0007) * 1.4 + Math.sin(performance.now() * 0.0019) * 0.6;
      if (active >= 0 && heat > 0.04) {
        acc += dt * (5 + 26 * heat);
        while (acc >= 1) {
          acc -= 1;
          const b = spotWorld(active);
          smoke.emit({ x: b.x + (trueRandom() - 0.5) * 0.4, y: b.y + 0.4, z: b.z + (trueRandom() - 0.5) * 0.4, vx: (trueRandom() - 0.5) * 0.5, vy: (2.4 + trueRandom() * 2.2) * (0.6 + heat), vz: (trueRandom() - 0.5) * 0.5, r0: 0.2 + trueRandom() * 0.2, grow: 0.5, life: 2.2 + trueRandom() * 1.2, a: (0.12 + trueRandom() * 0.1) * Math.min(1, 0.6 + heat), drag: 0.28 });
        }
      }
      smoke.tick(dt, wind * 0.6);
      const go = smoke.alive > 0 || (active >= 0 && heat > 0.04);
      if (!go) { smokeTicker = null; applyCoal(); return false; }
      return true;
    });
  }

  /* ───── 输入 ───── */
  let input = null;
  let flipGen = 0; // 翻面的动画一次只认最新的一个
  let skipFront = null;
  const api = {
    id: 'bu',
    group,
    hit: [...hits, bodyHit],
    radius: 9,
    spotWorld,
    measure(box) { box.makeEmpty(); for (const m of [topMesh, botMesh, wall]) box.expandByObject(m); }, // 龟甲的身体（版面按它排纸笺，不算接触影、炭条、烟）
    dbg: () => ({ rz: flipper.rotation.z, ly: flipper.position.y, smoke: smoke.alive, gen: flipGen, ember: ember.visible, coal: coal.visible }),
    setInput(i) { input = i; },
    get input() { return input; },
    /** 同步游戏状态：S.active、S.heat、S.used */
    sync(S) {
      let changed = false;
      SPOTS.forEach((_, i) => { if (used[i] !== !!S.used[i]) { used[i] = !!S.used[i]; changed = true; } });
      if (changed) { paintBack(); backTex.needsUpdate = true; }
      active = S.active;
      heat = S.heat;
      if (S.phase === 'pick') { if (active >= 0 && heat > 0.02) focusOn(); else focusOff(); }
      applyCoal();
      if (active >= 0 || smoke.alive) ensureSmoke();
      desk.invalidate();
    },
    /** "卜"的一声：一团烟冒出来 */
    puff() {
      if (active < 0) return;
      const b = spotWorld(active);
      for (let i = 0; i < 16; i++) smoke.emit({ x: b.x, y: b.y + 0.3, z: b.z, vx: (trueRandom() - 0.5) * 1.6, vy: (3 + trueRandom() * 4), vz: (trueRandom() - 0.5) * 1.6, r0: 0.25 + trueRandom() * 0.3, grow: 0.7, life: 2.2 + trueRandom() * 1.0, a: 0.2, drag: 0.4 });
      ensureSmoke();
    },
    highlight(i) {
      if (i == null || i < 0) { ring.visible = false; } else { ring.visible = true; ring.position.copy(spotWorld(i)).add(new THREE.Vector3(0, 0.05, 0)); }
      desk.invalidate();
    },
    /** 翻到正面：兆一道道裂开。opt: { crack, spot, other, otherSpot, delay, reduced, onDone }；返回取消函数 */
    showFront(opt) {
      const g = frontBg.getContext('2d');
      const k = frontBg.width / FIG_W;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.clearRect(0, 0, FIG_W, FIG_H);
      const bases = [spotPos(opt.spot), ...(opt.other ? [spotPos(opt.otherSpot)] : [])];
      paintShell(g, { seed: opt.crack.seed, bases });
      const f = frontCv.getContext('2d');
      const draw = (t, glow) => {
        f.setTransform(1, 0, 0, 1, 0, 0);
        f.clearRect(0, 0, frontCv.width, frontCv.height);
        f.drawImage(frontBg, 0, 0);
        const list = [{ crack: opt.crack, spot: opt.spot, t }, opt.other && { crack: opt.other, spot: opt.otherSpot, t: 1 }];
        for (const [dx, dy] of [[0, 0], [0.7, 0], [0, 0.7]]) { // 3D 里甲比二维的兆图小，裂纹描三遍，线才够粗
          f.setTransform(k, 0, 0, k, dx * k, dy * k);
          paintCracks(f, list, { glow: glow && !dx && !dy });
        }
        frontTex.needsUpdate = true;
      };
      draw(0, false);
      let dead = false;
      let stopFlip = null;
      const gen = ++flipGen;
      const run = () => {
        // 翻面：先抬起，转半圈，落下
        let p = 0;
        const from = flipper.rotation.z;
        const flipMs = opt.reduced ? 1 : 900;
        stopFlip = desk.addTicker((dt) => {
          if (gen !== flipGen) return false;
          p = Math.min(1, p + (dt * 1000) / flipMs);
          const e = p * p * (3 - 2 * p);
          flipper.rotation.z = from + (Math.PI - from) * e;
          flipper.position.y = T / 2 + liftFor(); // 抬的是转轴（世界的竖直方向），不能抬 lifter（它在转着的坐标里，抬起来是朝旁边）
          if (p >= 1) {
            flipper.rotation.z = Math.PI;
            flipper.position.y = T / 2;
            stopFlip = null;
            setTimeout(grow, opt.reduced ? 0 : opt.delay ?? 0);
            return false;
          }
          return true;
        });
      };
      let stopGrow = null;
      let timers = [];
      let finished = false;
      // 兆裂完：停 0.6 秒让人看清，再退回仪式机位（0.9 秒，退到一半时读兆的纸笺出现）；全程可以跳过
      const finish = (quick) => {
        if (finished) return;
        finished = true;
        timers.forEach(clearTimeout);
        timers = [];
        if (!focused) { opt.onDone?.(); return; }
        if (quick) { focusOff(260); timers.push(setTimeout(() => opt.onDone?.(), 160)); return; }
        timers.push(setTimeout(() => { focusOff(900); timers.push(setTimeout(() => opt.onDone?.(), 520)); }, 600));
      };
      const grow = () => {
        if (dead || finished) return;
        if (opt.reduced) { draw(1, false); focusOff(0, true); opt.onDone?.(); return; }
        let t = 0;
        stopGrow = desk.addTicker((dt) => {
          t = Math.min(1, t + (dt * 1000) / 2100);
          draw(t, t < 1);
          afterLight.intensity = AFTER * t * t; // 物理单位：6 厘米外约 50 勒克斯（比灯下的桌面亮一倍多，只照甲面一圈，范围 22 厘米；灯挂在器物上，3600 在昼里已经烧白），静帧看得出甲面泛暖，动起来明显，不刺眼
          if (t >= 1) { draw(1, false); stopGrow = null; fadeAfter(1100); finish(false); return false; }
          return true;
        });
      };
      // 跳过：翻面与生长立刻到位，镜头很快退回
      skipFront = () => {
        if (finished || dead) return;
        stopFlip?.(); stopFlip = null;
        stopGrow?.(); stopGrow = null;
        flipGen++;
        flipper.rotation.z = Math.PI;
        flipper.position.y = T / 2;
        draw(1, false);
        fadeAfter(300);
        finish(true);
      };
      run();
      return () => { dead = true; timers.forEach(clearTimeout); stopFlip?.(); stopGrow?.(); skipFront = null; };
    },
    /** 兆还在裂的时候点一下 / 按回车、空格、Esc：跳过推近与停顿 */
    skipFront() { skipFront?.(); },
    /** 翻回背面（再灼一处） */
    showBack() {
      afterStop?.(); afterLight.intensity = 0;
      focusOff(500);
      let p = 1;
      const from = flipper.rotation.z;
      const gen = ++flipGen;
      const stop = desk.addTicker((dt) => {
        if (gen !== flipGen) return false;
        p = Math.max(0, p - dt / 0.7);
        flipper.rotation.z = from * (p * p * (3 - 2 * p));
        flipper.position.y = T / 2 + liftFor(); // 抬的是转轴（世界的竖直方向），不能抬 lifter（它在转着的坐标里，抬起来是朝旁边）
        if (p <= 0) { flipper.rotation.z = 0; flipper.position.y = T / 2; return false; }
        return true;
      });
      void stop;
    },
    resetFlip() { afterStop?.(); afterLight.intensity = 0; focusOff(0, true); flipGen++; flipper.rotation.z = 0; flipper.position.y = T / 2; desk.invalidate(); },
    reset() {
      used.fill(false);
      paintBack();
      backTex.needsUpdate = true;
      active = -1;
      heat = 0;
      smoke.clear();
      applyCoal();
      api.resetFlip();
    },
  };
  return api;
}
