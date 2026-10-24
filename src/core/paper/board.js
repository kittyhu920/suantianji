// 案上字盘（docs/DESIGN.md §13、§18）：画心之外的"案"上铺一盘反刻的阳文活字。
//
// 两种实现，功能等价：
//   3D（src/core/scene/board3d.js，three.js，按需动态 import）：桌面宽度、有鼠标、不减少动效、WebGL 可用时；
//   2D（本文件的 mount2D）：其余一律退回——手机宽度（< 960px）、pointer: coarse、prefers-reduced-motion、WebGL 不可用。
// mountBoard 按条件选一种，条件变了（窗口跨过 960px、系统设置变了）会换过去。
//
// 2D 的做法：把一盘字预先排好、画在离屏画布上，只光栅化这一次；之后只用 CSS 的 transform 把它纵向循环滚动，
// 静止与滚动时都不逐帧重绘，也不跑 rAF。悬停整盘暂停；点一个字，那里"拓"出一枚小朱印，并洇开一团墨。
//
// 字从哪来：卷模块的可选字段 zipan（字符串，或返回字符串的函数，见 src/juan/index.js）；
// 没有的卷（以及卷首目录页、关于页）用《说文》部首。

import { createInk } from '../ink.js';
import { isDark, onTheme } from '../theme.js';
import { want3D, reducedQuery, coarseQuery } from '../scene/gate.js';
import { SHUOWEN_BUSHOU_SHOWN } from './shuowen-bushou.js';
import { modules } from '../../juan/modules.js';


const FONT = '"Noto Serif SC", "Songti SC", "STSong", serif';
const SPEED = 9; // 滚动速度，CSS 像素每秒
const MAX_STAMPS = 8;
const DARK = [6, 5, 4];
const WATER = [214, 196, 150];
const DARK_WASH = [214, 196, 150]; // 深色主题下"墨晕"是一团淡金
// 铅字两套配色：浅色是旧木盒里的铅字（灰褐、暖光）；深色是墨底冷光，偶见泥金
const TILE_LIGHT = {
  a: '#312c25', b: '#25211b', hi: 'rgba(255, 238, 200, .09)', lo: 'rgba(0, 0, 0, .42)',
  shade: 'rgba(0, 0, 0, .6)', rim: 'rgba(255, 238, 200, .11)', face: 'rgba(206, 190, 150, .2)', gold: 'rgba(206, 190, 150, .2)',
};
const TILE_DARK = {
  a: '#1b1d21', b: '#121316', hi: 'rgba(190, 210, 240, .1)', lo: 'rgba(0, 0, 0, .55)',
  shade: 'rgba(0, 0, 0, .7)', rim: 'rgba(190, 210, 240, .12)', face: 'rgba(150, 172, 210, .22)', gold: 'rgba(212, 172, 96, .42)',
};

// 只留 BMP 里的汉字：扩展 B 区以后的字几乎没有字形，回落到系统字体会显示成方框
const isDrawable = (ch) => {
  const c = ch.codePointAt(0);
  return (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff);
};
const clean = (s) => Array.from(String(s ?? '')).filter(isDrawable);

// 这一页该用哪一卷的字：路径的第一段是卷 id（/qian/…），卷模块有 zipan 就用，否则用部首。
// 书是常驻的，字盘只在首次进入页面时取字（换卷时不重建 three.js 画布）
async function pickChars() {
  const id = location.pathname.split('/').filter(Boolean)[0];
  const mod = id && modules[id];
  if (mod) {
    try {
      const z = typeof mod.zipan === 'function' ? await mod.zipan() : mod.zipan;
      const chars = clean(z);
      if (chars.length >= 40) return chars;
    } catch { /* 取不到就用部首 */ }
  }
  return clean(SHUOWEN_BUSHOU_SHOWN);
}

const hash = (n) => { // 确定性的小散列：哪些位置留作"空铅"
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// 点字时洇开的墨与水。深底上，浅色主题的墨晕要比底更黑才看得见；深色主题里是一团淡金
function boardWash(fx, x, y, R) {
  const dark = isDark();
  fx.wash(x, y, { color: dark ? DARK_WASH : DARK, R, a: dark ? 0.34 : 0.9, grow: 0.9, hold: 0.8, fade: 2.2 });
  fx.ripple(x, y, { color: dark ? DARK_WASH : WATER, r: R, rings: 2, a: dark ? 0.2 : 0.16 }); // 水纹是一圈淡淡的亮痕
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

let charsCache = null;
const getChars = async () => (charsCache ??= await pickChars());

function mount2D(board) {
  const roll = document.createElement('div');
  roll.className = 'zp-roll';
  const inkCanvas = document.createElement('canvas');
  inkCanvas.className = 'zp-ink';
  // 朱印另放一层，盖在墨之上，但与字盘同步滚动（两层用同一段动画，暂停也一起）
  const stampRoll = document.createElement('div');
  stampRoll.className = 'zp-roll zp-roll-top';
  board.append(roll, inkCanvas, stampRoll);

  const reduced = () => reducedQuery.matches;
  const fx = createInk(inkCanvas, { reduced: reduced() });

  let chars = null;
  let layout = null; // { cell, cols, rows, margin, tileH, cells: [[ch|null]] }
  let dead = false;
  let timer = 0;
  let renderId = 0;

  function drawTile(W, H) {
    const small = W <= 520;
    const cell = small ? 22 : 38;
    const slug = cell - (small ? 2 : 4);
    const fontPx = Math.round(slug * 0.7);
    const cols = Math.max(4, Math.floor(W / cell));
    const rows = Math.max(Math.ceil(H / cell), 8);
    const margin = (W - cols * cell) / 2;
    const tileH = rows * cell;

    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    while (dpr > 1 && W * dpr * tileH * 2 * dpr > 9e6) dpr = Math.max(1, dpr - 0.25); // 控制纹理总量
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(tileH * 2 * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `400 ${fontPx}px ${FONT}`;

    const P = isDark() ? TILE_DARK : TILE_LIGHT;
    const start = Math.floor(Math.random() * chars.length);
    const cells = [];
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let i = 0; i < cols; i++) {
        // 这一盘是版面的反面：整页镜像，所以行内次序也是自右向左
        const c = cols - 1 - i;
        const blank = hash(r * 131 + i * 7 + 3) < 0.05;
        const ch = blank ? null : chars[(start + k++) % chars.length];
        row[c] = ch;
        const x = margin + c * cell + (cell - slug) / 2;
        const y = r * cell + (cell - slug) / 2;

        // 铅字的身子：略有明暗，亮边在左上，暗边在右下
        const gr = g.createLinearGradient(x, y, x + slug, y + slug);
        gr.addColorStop(0, P.a);
        gr.addColorStop(1, P.b);
        g.fillStyle = gr;
        roundRect(g, x, y, slug, slug, 2);
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = P.hi;
        g.beginPath(); g.moveTo(x + 1, y + slug - 2); g.lineTo(x + 1, y + 1); g.lineTo(x + slug - 2, y + 1); g.stroke();
        g.strokeStyle = P.lo;
        g.beginPath(); g.moveTo(x + slug - 0.5, y + 2); g.lineTo(x + slug - 0.5, y + slug - 0.5); g.lineTo(x + 2, y + slug - 0.5); g.stroke();
        if (!ch) continue;

        // 阳文反字：镜像，浮雕般凸起（暗影在右下，亮边在左上，字身居中）
        const cx = x + slug / 2;
        const cy = y + slug / 2 + fontPx * 0.04;
        g.save();
        g.translate(cx, cy);
        g.scale(-1, 1);
        g.fillStyle = P.shade;
        g.fillText(ch, -1.1, 1.1);
        g.fillStyle = P.rim;
        g.fillText(ch, 0.8, -0.8);
        g.fillStyle = isDark() && hash(r * 977 + i * 31 + 7) < 0.045 ? P.gold : P.face; // 深色下偶见泥金
        g.fillText(ch, 0, 0);
        g.restore();
      }
      cells.push(row);
    }
    // 下半幅复制上半幅：滚过一个 tileH 之后正好首尾相接
    g.drawImage(cv, 0, 0, cv.width, tileH * dpr, 0, tileH * dpr, cv.width, tileH * dpr);
    layout = { cell, cols, rows, margin, tileH, cells, W };
    return cv;
  }

  async function render() {
    const id = ++renderId;
    if (!chars) chars = await getChars();
    if (dead || id !== renderId) return;
    const r = board.getBoundingClientRect();
    if (!r.width || !r.height) return;
    try {
      await document.fonts.load(`400 24px ${FONT}`, chars.slice(0, 1500).join(''));
    } catch { /* 字体没到就用已有的 */ }
    if (dead || id !== renderId) return;
    const cv = drawTile(Math.round(r.width), Math.round(r.height));
    cv.className = 'zp-tile';
    cv.style.width = `${Math.round(r.width)}px`;
    cv.style.height = `${layout.tileH * 2}px`;
    roll.replaceChildren(cv);
    stampRoll.replaceChildren();
    for (const el of [roll, stampRoll]) {
      el.style.setProperty('--tile-h', `${layout.tileH}px`);
      el.style.setProperty('--roll-dur', `${(layout.tileH / SPEED).toFixed(1)}s`);
      el.classList.add('is-ready');
    }
  }

  // 现在滚到哪儿了（负值，0 到 -tileH）
  function rollOffset() {
    const t = getComputedStyle(roll).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrix(t).m42;
  }

  // 点一个字：拓出一枚小朱印，并洇开一团墨
  function onClick(e) {
    if (!layout) return;
    const b = board.getBoundingClientRect();
    const x = e.clientX - b.left;
    const y = e.clientY - b.top;
    const { cell, cols, margin, rows, tileH, cells } = layout;
    const ty = rollOffset();
    const col = Math.min(cols - 1, Math.max(0, Math.floor((x - margin) / cell)));
    const rAbs = Math.floor((y - ty) / cell);
    const ch = cells[((rAbs % rows) + rows) % rows][col];
    const cx = margin + col * cell + cell / 2;
    const cyContent = rAbs * cell + cell / 2;

    boardWash(fx, cx, cyContent + ty, cell * 1.7);
    if (!ch) return;

    // 印放进同步滚动的上层，跟着那一枚铅字一起走；上下两幅各放一枚，循环到头时也在
    const rot = (Math.random() - 0.5) * 8;
    const made = [0, tileH].map((dy) => {
      const s = document.createElement('span');
      s.className = 'zp-stamp';
      s.textContent = ch;
      s.style.cssText = `left:${cx}px;top:${((cyContent % tileH) + tileH) % tileH + dy}px;--rot:${rot.toFixed(1)}deg;--sz:${cell - 6}px`;
      return s;
    });
    stampRoll.append(...made);
    while (stampRoll.children.length > MAX_STAMPS * 2) stampRoll.firstElementChild.remove();
    const gone = () => made.forEach((s) => s.remove());
    made[0].addEventListener('animationend', (ev) => { if (ev.animationName === 'zp-fade') gone(); });
    setTimeout(gone, 9000); // 减少动效下没有动画，也要收掉
  }

  // 手机上按住暂停（鼠标悬停暂停由 CSS 负责）
  const hold = () => board.classList.add('is-held');
  const release = () => board.classList.remove('is-held');
  const onDown = (e) => { if (e.pointerType !== 'mouse') hold(); };
  const onVis = () => {
    board.classList.toggle('is-away', document.hidden);
    document.documentElement.classList.toggle('is-away', document.hidden); // 纸背透字也跟着停
  };
  const onResize = () => { clearTimeout(timer); timer = setTimeout(render, 250); };

  board.addEventListener('click', onClick);
  board.addEventListener('pointerdown', onDown);
  board.addEventListener('pointerup', release);
  board.addEventListener('pointercancel', release);
  board.addEventListener('pointerleave', release);
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', onResize);
  const offTheme = onTheme(() => render()); // 换主题：铅字按新配色重画一次
  onVis();
  render();

  if (new URLSearchParams(location.search).has('debug')) window.__zipan = { fx, get layout() { return layout; }, rollOffset };

  return () => {
    dead = true;
    clearTimeout(timer);
    board.removeEventListener('click', onClick);
    board.removeEventListener('pointerdown', onDown);
    board.removeEventListener('pointerup', release);
    board.removeEventListener('pointercancel', release);
    board.removeEventListener('pointerleave', release);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    offTheme();
    fx.destroy();
  };
}

/** 选 2D 或 3D 并挂上；返回卸载函数。条件变了（窗口宽度、系统设置）会换过去。 */
export function mountBoard(board) {
  if (!board) return () => {};
  let mode = null;
  let stop = () => {};
  let dead = false;
  let ticket = 0;
  let timer = 0;
  const debug = new URLSearchParams(location.search).has('debug');

  function use2D() {
    mode = '2d';
    stop = mount2D(board);
  }

  async function use3D(id) {
    const chars = await getChars();
    const { createBoard3D } = await import('../scene/board3d.js'); // three.js 的包在这里才下载
    if (dead || id !== ticket) return;
    const inkCanvas = document.createElement('canvas');
    inkCanvas.className = 'zp-ink';
    const fx = createInk(inkCanvas, { reduced: false });
    let scene;
    try {
      scene = await createBoard3D(board, { chars, debug, wash: (x, y) => boardWash(fx, x, y, 62) });
    } catch (e) {
      console.warn('3D 字盘不可用，退回 2D：', e);
      fx.destroy();
      if (!dead && id === ticket) use2D();
      return;
    }
    if (dead || id !== ticket) { scene.destroy(); fx.destroy(); return; }
    board.append(inkCanvas);
    board.addEventListener('zp-gl-lost', fallback);
    mode = '3d';
    stop = () => { board.removeEventListener('zp-gl-lost', fallback); scene.destroy(); fx.destroy(); };
  }

  function fallback() { ticket++; reset(); use2D(); }
  function reset() {
    stop();
    stop = () => {};
    board.replaceChildren();
    mode = null;
  }

  function apply() {
    if (dead) return;
    const want = want3D() ? '3d' : '2d';
    if (want === mode || (want === '3d' && mode === 'pending')) return;
    const id = ++ticket;
    reset();
    if (want === '3d') {
      mode = 'pending';
      use3D(id).catch((e) => { console.warn('3D 字盘加载失败，退回 2D：', e); if (!dead && id === ticket) { reset(); use2D(); } });
    } else use2D();
  }

  const onChange = () => { clearTimeout(timer); timer = setTimeout(apply, 200); };
  addEventListener('resize', onChange);
  reducedQuery.addEventListener?.('change', onChange);
  coarseQuery.addEventListener?.('change', onChange);
  apply();

  return () => {
    dead = true;
    clearTimeout(timer);
    removeEventListener('resize', onChange);
    reducedQuery.removeEventListener?.('change', onChange);
    coarseQuery.removeEventListener?.('change', onChange);
    stop();
  };
}
