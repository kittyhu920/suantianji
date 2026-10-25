// 签卷的命书：签文页、解签页、掷筊的过程记录（页的笔法见 src/core/book/paint.js；通用的页见 src/core/book/pages.js）。
//   signPages({ sign, label, level })      签号与签名、签级、竖排的签诗；解签：白话、所问方向的建议
//   cupPages({ sign, throws, state })      掷筊的过程：每一支签、每一杯，圣杯、笑杯、阴杯，与这支签算不算数

import { C, F, PW, MARGIN, heading, para, item, vtext, rule } from '../../core/book/paint.js';
import { CUP_NAMES } from './jiao.js';

const CN = '零一二三四五六七八九十';
const cn = (n) => CN[n] ?? String(n);

export function signPages({ sign, label, domain, advice, state }) {
  if (!sign) {
    return [{
      id: 'sign',
      title: '没有签',
      text: '还没有抽签签筒里的签一支也没有出来',
      sig: 'sign',
      zhu: [],
      paint(g) {
        heading(g, '没有签', 108);
        para(g, '签还在筒里，一支也没有出来。空白，也是一种回答。', 230, { size: 26, align: 'center', font: F.kai });
      },
    }];
  }
  const first = {
    id: 'sign',
    title: `签文：${label}${sign.name}`,
    text: `${label}${sign.name}${sign.level}${sign.poem.join('')}`,
    sig: 'sign',
    zhu: ['六十甲子', '纳音', '签头'],
    paint(g) {
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `24px ${F.text}`;
      g.fillStyle = C.goldSoft;
      g.fillText(label, PW / 2, 104);
      g.font = `96px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(sign.name, PW / 2, 214);
      g.font = `32px ${F.display}`;
      const lw = g.measureText(sign.level).width + 44;
      g.strokeStyle = C.goldDim;
      g.lineWidth = 2;
      g.strokeRect(PW / 2 - lw / 2, 246, lw, 52);
      g.fillStyle = C.gold;
      g.textBaseline = 'middle';
      g.fillText(sign.level, PW / 2, 273);
      vtext(g, sign.poem, PW / 2 + 138, 352, { size: 46, pitch: 58, gap: 92, font: F.text });
    },
  };
  const second = {
    id: 'jie',
    title: '解签',
    text: `解签${sign.jie}${sign.bai}${advice ?? ''}${state.text}`,
    sig: 'jie',
    zhu: [],
    paint(g) {
      heading(g, '解签', 108);
      let y = para(g, sign.jie, 170, { size: 30, font: F.display, align: 'center', lh: 1.6 });
      rule(g, y + 10);
      y = item(g, '这支签在说什么', sign.bai, y + 38);
      if (advice) y = item(g, `关于${domain.desc}`, advice, y + 12);
      para(g, state.text, y + 20, { size: 22, color: state.key === 'no' ? C.cinnabar : C.goldSoft, font: F.kai }); // 阴杯：朱
    },
  };
  return [first, second];
}

export function cupPages({ throws, state, sign }) {
  const draws = [...new Set(throws.map((t) => t.draw))];
  const rows = (d) => [0, 1, 2]
    .map((i) => throws.filter((t) => t.draw === d && t.cup === i).map((t) => t.kind))
    .filter((a) => a.length);
  return [{
    id: 'cups',
    title: '掷筊请示',
    text: `掷筊请示${sign?.name ?? ''}${throws.map((t) => CUP_NAMES[t.kind]).join('')}第杯支${state.text}圣杯一平一凸神明同意笑杯两面都平再掷一次阴杯两面都凸神明不同意连续三次圣杯这支签才算数`,
    sig: 'cups',
    zhu: ['筊杯', '圣杯', '笑杯', '阴杯', '三杯定签'],
    paint(g) {
      heading(g, '掷筊请示', 108);
      let y = 176;
      if (!draws.length) y = para(g, '一次也没掷。', y, { size: 28, align: 'center', font: F.kai });
      draws.forEach((d, k) => {
        if (draws.length > 1) {
          g.textAlign = 'left';
          g.textBaseline = 'alphabetic';
          g.font = `26px ${F.display}`;
          g.fillStyle = C.gold;
          g.fillText(`第${cn(k + 1)}支${k === draws.length - 1 && sign ? `　${sign.name}` : '　（作废）'}`, MARGIN, y + 26);
          y += 46;
        }
        const kept = throws.some((t) => t.draw === d && t.kept);
        rows(d).forEach((seq, i) => {
          g.textAlign = 'left';
          g.textBaseline = 'alphabetic';
          g.font = `22px ${F.display}`;
          g.fillStyle = C.goldDim;
          g.fillText(`第${cn(i + 1)}杯`, MARGIN + 8, y + 28);
          let x = MARGIN + 100;
          seq.forEach((kind, j) => {
            if (j) { g.font = `22px ${F.text}`; g.fillStyle = C.goldDim; g.fillText('→', x, y + 28); x += 40; }
            g.font = `34px ${F.display}`;
            g.fillStyle = kind === 'yin' ? C.cinnabar : kept ? C.gold : C.goldDim; // 阴杯：朱
            g.fillText(CUP_NAMES[kind], x, y + 32);
            x += g.measureText(CUP_NAMES[kind]).width + 14;
          });
          y += 56;
        });
        y += 16;
      });
      rule(g, y + 6);
      y += 26;
      y = para(g, state.text, y, { size: 24, color: state.key === 'no' ? C.cinnabar : C.goldSoft, font: F.kai });
      y = para(g, '圣杯：一平一凸，神明同意。笑杯：两面都平，没说清，再掷一次。阴杯：两面都凸，神明不同意。连续三次圣杯，这支签才算数。', y + 14, { size: 20, color: C.goldDim, font: F.kai });
    },
  }];
}
