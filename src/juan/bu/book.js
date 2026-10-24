// 卜卷的命书：兆页（刻了辞的甲，兆纹与刻辞和桌上的兆图是同一份数据、同一套版面）、解兆页、灼的过程记录。
// 页的笔法见 src/core/book/paint.js；甲的画法与分享图共用 poster.js 的 drawFigure。

import { C, F, PW, MARGIN, heading, para, item, rule } from '../../core/book/paint.js';
import { drawFigure } from './poster.js';
import { FIG_W } from './shell.js';
import { OMENS, explain } from './omen.js';
import { BAI, ADVICE, cnNum } from './data.js';

export function omenPages({ fig, omenKey, zhan, state, domain, domainKey }) {
  if (!fig.main) {
    return [{
      id: 'omen',
      text: '龟甲还没有裂',
      sig: 'omen',
      zhu: [],
      paint(g) {
        heading(g, '没有兆', 108);
        para(g, '龟甲还没有裂。空白，也是一种回答。', 230, { size: 26, align: 'center', font: F.kai });
      },
    }];
  }
  const o = OMENS[omenKey];
  const first = {
    id: 'omen',
    text: `${fig.question}${fig.fanQuestion}${fig.qianci}${fig.zhan}兆曰${o.name}${fig.main.xu}${fig.fan?.xu ?? ''}${fig.fan?.name ?? ''}`,
    sig: 'omen',
    zhu: ['兆干兆枝', '兆象', '兆序', '钻凿', '前辞命辞占辞验辞'],
    paint(g) {
      drawFigure(g, PW / 2 - FIG_W / 2, 56, 1, fig, F.display);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `64px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(`兆曰${o.name}`, PW / 2, 700);
      g.font = `30px ${F.display}`;
      g.fillStyle = C.goldSoft;
      g.fillText(zhan, PW / 2, 752);
    },
  };
  const second = {
    id: 'jiezhao',
    text: `解兆${state.text}${o.name}${zhan}${BAI[omenKey]}${domain ? ADVICE[omenKey][domainKey] : ''}这些白话与建议是本作自己写的不是卜辞里的话`,
    sig: 'jiezhao',
    zhu: ['卜辞', '亡尤', '有祟', '王占曰'],
    paint(g) {
      heading(g, '解兆', 108);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `22px ${F.kai}`;
      g.fillStyle = state.key === 'no' ? C.cinnabar : C.goldSoft; // 改判：朱
      g.fillText(state.text, PW / 2, 172, PW - MARGIN * 2);
      g.font = `64px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(`兆曰${o.name}`, PW / 2, 250);
      g.font = `30px ${F.display}`;
      g.fillStyle = C.goldSoft;
      g.fillText(zhan, PW / 2, 300);
      rule(g, 328);
      let y = item(g, '这道兆在说什么', BAI[omenKey], 352);
      if (domain) y = item(g, `关于${domain.desc}`, ADVICE[omenKey][domainKey], y + 12);
      para(g, '这些白话与建议是本作自己写的，不是卜辞里的话。', y + 16, { size: 19, font: F.kai, color: C.goldDim });
    },
  };
  return [first, second];
}

/** 灼的过程：每一灼的钻凿、按住的时间、手抖、读出的兆；改判的那一灼点朱 */
export function burnPages({ burns, cur, override, sec }) {
  const kindName = { zheng: '正问', again: '再灼', fan: '对贞' };
  return [{
    id: 'burns',
    text: `灼卜${burns.map((b, i) => `${cnNum(i + 1)}${kindName[b.kind]}${OMENS[b.omen].name}${explain(b.metrics)}`).join('')}第处按秒抖像素改判`,
    sig: 'burns',
    zhu: ['灼', '正反对贞', '命辞', '钻凿'],
    paint(g) {
      heading(g, '灼卜', 108);
      let y = 172;
      if (!burns.length) para(g, '一次也没灼。', y, { size: 28, align: 'center', font: F.kai });
      burns.forEach((b, i) => {
        const isCur = i === cur;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `28px ${F.display}`;
        g.fillStyle = isCur ? C.gold : C.goldSoft;
        g.fillText(`第${cnNum(i + 1)}灼　${kindName[b.kind]}`, MARGIN, y + 28);
        g.textAlign = 'right';
        g.font = `34px ${F.display}`;
        g.fillStyle = isCur && override ? C.cinnabar : C.gold;
        g.fillText(OMENS[b.omen].name + (isCur && override ? '（改判为吉）' : ''), PW - MARGIN, y + 30);
        y += 44;
        y = para(g, `第${cnNum(b.spot + 1)}处钻凿，按住 ${sec(b.hold)} 秒，手抖 ${b.jit} 像素。我这样读：${explain(b.metrics)}。`, y, { size: 19, font: F.kai, color: C.goldSoft, lh: 1.65 });
        y += 14;
      });
    },
  }];
}
