// 分享图：把这一局的签、结局与命盘画成一页宣纸，1080 × 2860，落款处附二维码（风格见 docs/DESIGN.md）
// 全部由 Canvas 当场绘制，不引入任何位图素材。

import { mulberry32 } from './rng.js';
import { weave } from './loom.js';

const W = 1080;
const H = 2860;
const C = {
  paper: '#efe6d0',
  gold: '#1b1712', goldSoft: 'rgba(27,23,18,.74)', goldDim: 'rgba(27,23,18,.5)', goldFaint: 'rgba(27,23,18,.14)', // 墨（沿用旧名）
  cinnabar: '#b3261f', cinnabarHi: '#b3261f', ink: '#f6eedb', // ink：朱印上的字
};
// 站点网址的二维码点阵（29×29，纠错等级 Q）。网址固定，所以离线算好直接嵌入，不引入二维码库。
// 重新生成：python -c "import segno;q=segno.make('https://suantianji.pages.dev',error='m');print([''.join('1' if c else '0' for c in r) for r in q.matrix])"
const QR = ["11111110010010011000001111111", "10000010011111011011001000001", "10111010100100001110101011101", "10111010010101110010001011101", "10111010100000010010001011101", "10000010111010001101001000001", "11111110101010101010101111111", "00000000010000111100100000000", "01001010100000111011110110100", "10111000111100100110001111011", "01100111001001000010010011001", "11001101011001100100110000011", "11110111101010001101000101001", "11111101001011100000001010101", "01110011010101011100101010001", "11110001100011001101001101010", "11101110100000010011110000001", "10011100010011101010011110001", "00110111111111001110000000101", "00011001110100100101100101011", "11011011110110110100111110011", "00000000101101011110100010101", "11111110010101010011101010001", "10000010000100011001100011010", "10111010101110001001111110011", "10111010001101000110000101110", "10111010000000110101110000011", "10000010101010111110111101011", "11111110000110100101111011010"];
const SITE = 'suantianji.pages.dev';

const TITLE = '"Zhi Mang Xing", "Ma Shan Zheng", "STKaiti", serif';
const BRUSH = '"Ma Shan Zheng", "STKaiti", "KaiTi", serif';
const TEXT = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", serif';

// 行首不放的标点
const NO_HEAD = '，。、；：？！”’）》」』…—';

function wrap(g, text, maxW) {
  const lines = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW && line && !NO_HEAD.includes(ch)) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function paper(g, seed) {
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);
  // 纸纹：横向拉长的纤维颗粒
  const rand = mulberry32(seed);
  for (let i = 0; i < 12000; i++) {
    g.fillStyle = `rgba(90,72,48,${(rand() * 0.07).toFixed(3)})`;
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 5, 1.2);
  }
  // 朱丝栏
  g.fillStyle = 'rgba(179,38,31,.2)';
  for (let x = 70; x < W - 40; x += 118) g.fillRect(x, 60, 2, H - 120);
  // 版框：四周双边
  g.strokeStyle = C.gold;
  g.lineWidth = 8;
  g.strokeRect(28, 28, W - 56, H - 56);
  g.lineWidth = 2.5;
  g.strokeRect(44, 44, W - 88, H - 88);
}

// 枯笔一扫：许多条细笔沿同一条弧线走，随机断开，模拟飞白
function inkSwash(g, seed) {
  const rand = mulberry32(seed ^ 0x5bd1e995);
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < 90; k++) {
    const t = k / 89;
    const off = (t - 0.5) * 230;
    g.strokeStyle = `rgba(27,23,18,${(0.55 + rand() * 0.45).toFixed(2)})`;
    g.lineWidth = 2 + rand() * 5;
    const gap = 40 + rand() * 260;
    g.setLineDash([gap * (t > 0.85 || t < 0.1 ? 1.2 : 6), 4 + rand() * (t > 0.8 ? 60 : 14)]);
    g.lineDashOffset = rand() * 200;
    g.beginPath();
    g.moveTo(-60, 470 + off);
    g.bezierCurveTo(260, 380 + off, 640, 250 + off * 0.8, W + 80, 190 + off * 0.6);
    g.stroke();
  }
  g.setLineDash([]);
  // 溅墨
  for (let i = 0; i < 5; i++) {
    g.fillStyle = C.gold;
    g.beginPath();
    g.arc(760 + rand() * 220, 420 + rand() * 120, 4 + rand() * 14, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function seal(g, cx, cy, s, ch) {
  g.fillStyle = C.cinnabar;
  g.fillRect(cx - s / 2, cy - s / 2, s, s);
  g.strokeStyle = 'rgba(246,238,219,.7)';
  g.lineWidth = 3;
  g.strokeRect(cx - s / 2 + 8, cy - s / 2 + 8, s - 16, s - 16);
  g.fillStyle = C.ink;
  g.font = `${Math.round(s * 0.58)}px ${BRUSH}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, cx, cy + s * 0.03);
}

function center(g, text, y, font, color) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(text, W / 2, y);
}

/**
 * @param {object} d
 * @param {{no:string,name:string,level:string,poem:string[],bai:string}|null} d.sign
 * @param {string} d.cups  三杯结果，如"圣杯 · 圣杯 · 阴杯"
 * @param {string} d.state 签是否算数
 * @param {{name:string,sub:string}} d.ending
 * @param {object[]} d.throws 每一掷的记录，用来按海报尺寸重织命盘
 * @param {number} d.seed
 * @param {string} d.date
 */
export async function drawPoster(d) {
  const sample = [d.sign?.name, d.sign?.no, d.sign?.level, ...(d.sign?.poem ?? []), d.sign?.bai, d.cups, d.state,
    d.ending.name, d.ending.sub, '演算天机你求签我算这支签在说什么在你求签的时候我也在给你算命扫码来求一签'].join('');
  await Promise.all([document.fonts.load(`48px ${BRUSH}`, sample), document.fonts.load(`38px ${TEXT}`, sample),
    document.fonts.load(`84px ${TITLE}`, '演算天机')]);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  paper(g, d.seed);
  inkSwash(g, d.seed);
  // 标题反白压在墨上
  g.save();
  g.translate(W / 2, 330);
  g.rotate(-0.2);
  g.font = `150px ${TITLE}`;
  g.fillStyle = C.paper;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('演算天机', 0, 0);
  g.restore();

  let y = 520;
  g.save();
  g.font = `44px ${BRUSH}`;
  g.fillStyle = C.gold;
  g.textAlign = 'center';
  g.fillText('你 求 签 ， 我 算 你', W / 2, y);
  g.restore();

  if (d.sign) {
    y += 110;
    center(g, d.sign.no, y, `34px ${TEXT}`, C.goldSoft);
    y += 118;
    center(g, d.sign.name, y, `108px ${BRUSH}`, C.gold);
    // 等级
    y += 36;
    g.font = `38px ${BRUSH}`;
    const lw = g.measureText(d.sign.level).width + 40;
    g.strokeStyle = C.goldDim;
    g.lineWidth = 2;
    g.strokeRect(W / 2 - lw / 2, y, lw, 58);
    g.fillStyle = C.gold;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(d.sign.level, W / 2, y + 31);

    // 签诗：竖排，自右向左
    y += 118;
    g.font = `52px ${TEXT}`;
    g.fillStyle = C.gold;
    const colGap = 96;
    const x0 = W / 2 + colGap * 1.5;
    d.sign.poem.forEach((line, i) => {
      [...line].forEach((ch, j) => g.fillText(ch, x0 - i * colGap, y + j * 66));
    });
    y += 66 * 7 + 40;

    // 白话大意
    g.textBaseline = 'alphabetic';
    center(g, '这支签在说什么', y, `40px ${BRUSH}`, C.gold);
    y += 70;
    g.font = `38px ${TEXT}`;
    g.fillStyle = C.gold;
    for (const line of wrap(g, d.sign.bai, 860)) {
      g.textAlign = 'center';
      g.fillText(line, W / 2, y);
      y += 62;
    }
  }

  // 三杯
  y += 50;
  center(g, d.cups, y, `50px ${BRUSH}`, C.gold);
  y += 56;
  center(g, d.state, y, `32px ${TEXT}`, d.stateNo ? C.cinnabarHi : C.goldSoft);

  // 结局
  y += 110;
  g.font = `100px ${BRUSH}`;
  const nameW = g.measureText(d.ending.name).width;
  const blockW = 130 + 30 + nameW;
  const bx = W / 2 - blockW / 2;
  seal(g, bx + 65, y, 130, d.ending.name[0]);
  g.font = `100px ${BRUSH}`;
  g.fillStyle = C.gold;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillText(d.ending.name, bx + 160, y + 20);
  g.font = `30px ${TEXT}`;
  g.fillStyle = C.goldSoft;
  g.fillText([...d.ending.sub].join(' '), bx + 164, y + 62);

  // 点破
  y += 170;
  center(g, '在你求签的时候，我也在给你算命。', y, `44px ${BRUSH}`, C.gold);

  // 命盘
  y += 50;
  const lw2 = 640;
  const lh2 = lw2 * 0.75;
  const room = H - 380 - y; // 下面留给落款与二维码
  const scale = Math.min(1, room / lh2);
  const mw = lw2 * scale;
  const mh = lh2 * scale;
  // 用同一个种子和掷筊记录重织一遍：图案与页面上的一致，但按海报尺寸绘制，更清晰
  const loom = document.createElement('canvas');
  await weave(loom, { seed: d.seed, throws: d.throws, reduced: true, width: Math.round(mw) });
  g.drawImage(loom, W / 2 - mw / 2, y, mw, mh);
  g.strokeStyle = C.goldFaint;
  g.lineWidth = 2;
  g.strokeRect(W / 2 - mw / 2, y, mw, mh);

  // 落款：左边字，右边二维码
  const cell = 8;
  const qs = QR.length * cell;
  const qx = W / 2 + 60;
  const qy = H - 110 - qs;
  g.fillStyle = C.paper;
  g.fillRect(qx - cell * 4, qy - cell * 4, qs + cell * 8, qs + cell * 8); // 四格静区，免得纸纹干扰识别
  g.fillStyle = C.gold;
  QR.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '1') g.fillRect(qx + c * cell, qy + r * cell, cell, cell); });
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.font = `46px ${BRUSH}`;
  g.fillStyle = C.gold;
  g.fillText('扫码来求一签', qx - 50, qy + qs * 0.42);
  g.font = `26px ${TEXT}`;
  g.fillStyle = C.goldDim;
  g.fillText(SITE, qx - 50, qy + qs * 0.42 + 56);
  g.fillText(d.date, qx - 50, qy + qs * 0.42 + 96);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}
