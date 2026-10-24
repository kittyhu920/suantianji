// 卜卷的分享图：一块刻了辞的甲，兆纹与刻辞与网页上的兆图是同一份数据、同一套版面（shell.js）。
// 纸面、远山、标题、结局印、命盘与二维码在 src/core/poster.js。
// 传给 drawPoster 的 d 里，本卷的字段是：
//   question, fanQuestion, qianci, omenName
//   main { crack, xu }          正问的兆（makeCrack 的返回值）与兆序
//   fan  { crack, xu, name }    对贞的兆，可空
//   zhan                        刻上去的占辞
//   state, stateNo              兆怎么处理的一句话；stateNo 为真时用朱（凶兆，或改判）

import { loomStyle } from './loom-style.js';
import { crackSignature } from './crack.js';
import { paintShell, paintCracks, carveLayout, spotPos, FIG_W, FIG_H, CARVE } from './shell.js';
import { wrapCols } from './data.js';

const SCALE = 1.7;

function carveOf(d) {
  const c = { xu: d.main?.xu, mainSpot: d.main?.spot, fanSpot: d.fan ? d.fan.spot : null, qian: d.qianci, ming: wrapCols(d.question), zhan: wrapCols(d.zhan, 8) };
  if (d.fan) {
    c.fanXu = d.fan.xu;
    c.fanMing = wrapCols(`贞：${d.fanQuestion}`);
    c.fanZhao = wrapCols(`兆曰${d.fan.name}。`, 8);
  }
  return c;
}

/** 画一块刻了辞的甲（分享图与命书共用）：龟甲、兆纹、兆序、刻辞，左上角在 (x0, y)，scale 是比兆图设计尺寸放大几倍。返回甲的高度 */
export function drawFigure(g, x0, y, scale, d, BRUSH) {
  g.save();
  g.translate(x0, y);
  g.scale(scale, scale);
  const mp = spotPos(d.main.spot);
  const fp = d.fan ? spotPos(d.fan.spot) : null;
  paintShell(g, { seed: d.main.crack.seed, bases: [mp, ...(fp ? [fp] : [])] });
  paintCracks(g, [{ crack: d.main.crack, spot: d.main.spot }, d.fan && { crack: d.fan.crack, spot: d.fan.spot }], { glow: false });
  // 兆序
  g.font = `15px ${BRUSH}`;
  g.fillStyle = 'rgba(40,28,16,.8)';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(d.main.xu, mp.flip ? mp.x + 18 : mp.x - 36, mp.y - 14);
  if (fp) g.fillText(d.fan.xu, fp.flip ? fp.x + 18 : fp.x - 36, fp.y - 14);
  // 刻辞：先一层浅色（刀口的亮边），再一层深色
  g.textAlign = 'center';
  g.font = `${CARVE.font}px ${BRUSH}`;
  for (const col of carveLayout(carveOf(d))) {
    [...col.t].forEach((ch, i) => {
      const cy = col.y + CARVE.font / 2 + 2 + i * CARVE.pitchY;
      g.fillStyle = 'rgba(250,242,220,.6)';
      g.fillText(ch, col.x + 0.8, cy + 1);
      g.fillStyle = col.k === 'zhan' ? 'rgba(30,20,12,.95)' : 'rgba(40,28,16,.88)';
      g.fillText(ch, col.x, cy);
    });
  }
  g.restore();
  return FIG_H * scale;
}

function body(g, y, d, { W, C, TEXT, BRUSH, center, wrap }) {
  if (!d.main) {
    y += 120;
    center(g, '龟甲还没有裂', y, `60px ${BRUSH}`, C.gold);
    return y;
  }
  if (location.search.includes('debug')) window.__buPoster = { main: crackSignature(d.main.crack), fan: d.fan ? crackSignature(d.fan.crack) : null }; // 调试：核对分享图里的兆与页面上的是同一道
  y += 40;
  y += drawFigure(g, W / 2 - (FIG_W * SCALE) / 2, y, SCALE, d, BRUSH);
  y += 70;

  center(g, `兆曰${d.omenName}`, y, `76px ${BRUSH}`, C.gold);
  y += 66;
  center(g, d.zhan, y, `40px ${BRUSH}`, C.goldSoft);
  y += 56;
  center(g, d.state, y, `30px ${TEXT}`, d.stateNo ? C.cinnabarHi : C.goldSoft);
  return y;
}

export const posterSpec = {
  tagline: '你 灼 龟 ， 我 读 兆',
  turn: '在你灼龟的时候，我也在给你算命。',
  qrLabel: '扫码来卜一卜',
  sample: (d) => [d.question, d.fanQuestion, d.qianci, d.omenName, d.zhan, d.state, d.main?.xu, d.fan?.xu, d.fan?.name,
    '你灼龟我读兆兆曰龟甲还没有裂贞：兆曰在你灼龟的时候我也在给你算命扫码来卜一卜〇一二三四五六七八九十'].join(''),
  style: loomStyle,
  body,
};
