// 分享图：把这一局的签、结局与命盘画成一张竖幅立轴，1080 × 2400
// 全部由 Canvas 当场绘制，不引入任何位图素材。

import { mulberry32 } from './rng.js';
import { weave } from './loom.js';

const W = 1080;
const H = 2400;
const C = {
  wall: '#1A1C1E', gan: '#1F2630', ganDeep: '#171C24', jade: '#2E5E4E', jadeDeep: '#22463a',
  gold: '#C5A059', goldSoft: 'rgba(197,160,89,.72)', goldDim: 'rgba(197,160,89,.45)', goldFaint: 'rgba(197,160,89,.16)',
  cinnabar: '#9E2A2B', cinnabarHi: '#c4403c', ink: '#F2E6CC',
};
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

function paper(g, x, y, w, h, seed) {
  g.fillStyle = C.gan;
  g.fillRect(x, y, w, h);
  // 纸纹：细竖纹 + 随机颗粒
  g.fillStyle = 'rgba(197,160,89,.022)';
  for (let i = x; i < x + w; i += 2) g.fillRect(i, y, 1, h);
  const rand = mulberry32(seed);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(197,160,89,${(rand() * 0.06).toFixed(3)})`;
    g.fillRect(x + rand() * w, y + rand() * h, 1.5, 1.5);
  }
  const v = g.createRadialGradient(W / 2, H * 0.42, h * 0.3, W / 2, H * 0.42, h * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = v;
  g.fillRect(x, y, w, h);
  g.strokeStyle = C.goldFaint;
  g.lineWidth = 2;
  g.strokeRect(x + 14, y + 14, w - 28, h - 28);
}

function mount(g, y, h) {
  const grd = g.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, C.jade);
  grd.addColorStop(1, C.jadeDeep);
  g.fillStyle = grd;
  g.fillRect(0, y, W, h);
  g.fillStyle = 'rgba(255,255,255,.025)';
  for (let i = 0; i < W; i += 3) g.fillRect(i, y, 1, h);
}

function seal(g, cx, cy, s, ch) {
  g.fillStyle = C.cinnabar;
  g.fillRect(cx - s / 2, cy - s / 2, s, s);
  g.strokeStyle = 'rgba(242,230,204,.55)';
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
    d.ending.name, d.ending.sub, '演算天机数字重彩问命录这支签在说什么在你求签的时候我也在给你算命'].join('');
  await Promise.all([document.fonts.load(`48px ${BRUSH}`, sample), document.fonts.load(`38px ${TEXT}`, sample)]);

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  g.fillStyle = C.wall;
  g.fillRect(0, 0, W, H);
  mount(g, 0, 96);
  mount(g, H - 90, 90);
  paper(g, 0, 96, W, H - 186, d.seed);

  let y = 250;
  center(g, '演算天机', y, `84px ${BRUSH}`, C.gold);
  y += 58;
  g.save();
  g.font = `30px ${TEXT}`;
  g.fillStyle = C.goldDim;
  g.textAlign = 'center';
  g.fillText('数 字 重 彩 问 命 录', W / 2, y);
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
    g.fillStyle = C.ink;
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
  const room = H - 90 - 90 - y;
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

  // 落款
  center(g, `suantianji.pages.dev　${d.date}`, H - 124, `28px ${TEXT}`, C.goldDim);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}
