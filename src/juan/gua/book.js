// 卦卷的命书：卦页（卦画、卦辞）、解卦页、六位二进制的一页、起卦的过程记录。
// 页的笔法见 src/core/book/paint.js，卦画与分享图共用 poster.js 的 figure（一爻一笔墨，变爻点朱）。

import { C, F, PW, MARGIN, heading, para, item, rule } from '../../core/book/paint.js';
import { flow, drawOps } from '../../core/book/flow.js';
import { figure, FIG_H } from './poster.js';
import { afterChange, CN_YAO, CN_YAO_SHORT, YAO, faceText } from './yao.js';
import { BINARY } from './words.js';

const CN = '零一二三四五六七八九十';

export function hexPages({ hex, changed, vs, domain, advice, bits, value, seed }) {
  const hexPage = {
    id: 'hex',
    title: `本卦：${hex.name}`,
    text: `${hex.upper}上${hex.lower}下本卦无变爻${hex.name}${changed?.name ?? ''}之变卦${hex.ci}`,
    sig: 'hex',
    zhu: ['本卦', '变卦', '卦辞', '上卦下卦', '金钱卦'],
    paint(g) {
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `24px ${F.text}`;
      g.fillStyle = C.goldSoft;
      g.fillText(`${hex.upper}上${hex.lower}下 · ${changed ? '本卦' : '无变爻'}`, PW / 2, 100);
      g.font = `110px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(hex.name, PW / 2, 214);
      const top = 258;
      if (changed) {
        figure(g, PW / 2 - 130, top, vs, 170, { C, seed });
        figure(g, PW / 2 + 130, top, afterChange(vs), 170, { C, seed: seed ^ 77 });
        g.font = `40px ${F.display}`;
        g.fillStyle = C.gold;
        g.textBaseline = 'middle';
        g.fillText('之', PW / 2, top + FIG_H / 2);
        g.textBaseline = 'alphabetic';
        g.font = `30px ${F.display}`;
        g.fillText(`变卦　${changed.name}`, PW / 2 + 130, top + FIG_H + 46);
      } else {
        figure(g, PW / 2, top, vs, 250, { C, seed });
      }
      const y = top + FIG_H + (changed ? 96 : 44);
      rule(g, y, MARGIN + 60, PW - MARGIN - 60);
      para(g, hex.ci, y + 26, { size: 32, font: F.display, align: 'center', lh: 1.55 });
    },
  };
  const jie = {
    id: 'jiegua',
    title: '解卦',
    text: `解卦${hex.bai}${advice ?? ''}${changed ? `${changed.name}${changed.ci}${changed.bai}` : '没有变爻六爻都不动只看这一卦没有后来的样子'}`,
    sig: 'jiegua',
    zhu: [],
    paint(g) {
      heading(g, '解卦', 108);
      let y = item(g, '这一卦在说什么', hex.bai, 170);
      if (advice) y = item(g, `关于${domain.desc}`, advice, y + 14);
      if (changed) y = item(g, `变成${changed.name}`, `${changed.ci}　${changed.bai}`, y + 14);
      else y = item(g, '没有变爻', '六爻都不动，只看这一卦，没有后来的样子。', y + 14);
    },
  };
  // 六位二进制：上半页是六个格子，下面的话一页放不下就续页
  const rest = flow([
    { k: 'p', text: `自下而上读作 ${bits}，初爻为最低位，是十进制的 ${value}。`, size: 22, align: 'center', gap: 10 },
    { k: 'p', text: BINARY.p1(bits, value), size: 19, gap: 8 },
    { k: 'p', text: BINARY.p2.join(''), size: 19, gap: 8 },
    { k: 'p', text: BINARY.p3, size: 19, color: C.goldSoft, gap: 8 },
    { k: 'p', text: BINARY.p4, size: 19 },
  ], { first: 330 });
  const bin = rest.map((ops, n) => ({
    id: `binary${n}`,
    title: n ? `${BINARY.title}（续）` : BINARY.title,
    text: `${BINARY.title}${BINARY.lead}${ops.map((o) => o.text).join('')}${CN_YAO_SHORT.join('')}`,
    sig: `binary${n}`,
    zhu: ['先天八卦', '莱布尼茨', '二进制'],
    paint(g) {
      heading(g, n ? `${BINARY.title}（续）` : BINARY.title, 100, 30);
      if (!n) {
        para(g, BINARY.lead, 150, { size: 22, font: F.kai, align: 'center', color: C.goldSoft });
        // 六位：自下而上，初爻是最低位
        const bw = 62;
        const x0 = PW / 2 - (bw * 6) / 2;
        [...bits].forEach((b, i) => {
          const x = x0 + i * bw;
          g.strokeStyle = C.goldFaint;
          g.lineWidth = 2;
          g.strokeRect(x + 4, 208, bw - 8, 86);
          g.textAlign = 'center';
          g.textBaseline = 'alphabetic';
          g.font = `18px ${F.display}`;
          g.fillStyle = C.goldDim;
          g.fillText(CN_YAO_SHORT[i], x + bw / 2, 232);
          g.font = `42px ${F.text}`;
          g.fillStyle = b === '1' ? C.gold : C.goldDim;
          g.fillText(b, x + bw / 2, 280);
        });
      }
      drawOps(g, ops);
    },
  }));
  return [hexPage, jie, ...bin];
}

/** 起卦的过程：每一卦的六爻（背、字、爻名、数），被你弃掉的卦淡一些 */
export function castPages({ casts, final }) {
  return [{
    id: 'casts',
    title: '起卦',
    text: `起卦${casts.map((c) => c.hex.name + c.lines.map((l) => `${CN_YAO[0]}${faceText(l.faces[0])}${YAO[l.v].name}${l.v}`).join('')).join('')}弃第卦背字`,
    sig: 'casts',
    zhu: ['爻', '老阳', '少阴', '少阳', '老阴', '阴阳爻', '龟壳'],
    paint(g) {
      heading(g, '起卦', 108);
      let y = 170;
      const small = casts.length > 2;
      const lh = small ? 31 : 38;
      casts.forEach((c, k) => {
        const dropped = k < casts.length - 1 || !final;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `26px ${F.display}`;
        g.fillStyle = dropped ? C.goldDim : C.gold;
        g.fillText(`第${CN[k + 1] ?? k + 1}卦　${c.hex.name}${c.changed ? ` → ${c.changed.name}` : ''}${dropped ? '（弃）' : ''}`, MARGIN, y + 26);
        y += 40;
        c.lines.forEach((l, i) => {
          g.font = `${small ? 18 : 21}px ${F.text}`;
          g.fillStyle = dropped ? C.goldDim : C.goldSoft;
          const mv = YAO[l.v].moving;
          g.fillText(`${CN_YAO[i]}　${l.faces.map(faceText).join('')}　${YAO[l.v].faces}`, MARGIN + 10, y + lh * 0.7);
          g.textAlign = 'right';
          g.fillStyle = mv ? C.cinnabar : dropped ? C.goldDim : C.gold; // 变爻点朱
          g.fillText(`${YAO[l.v].name} ${l.v}${mv ? ' 〇' : ''}`, PW - MARGIN, y + lh * 0.7);
          g.textAlign = 'left';
          y += lh;
        });
        y += small ? 12 : 22;
      });
    },
  }];
}

/** 一爻也没掷：什么也没起出来，空白，也是一种回答 */
export function noHexPages() {
  return [{
    id: 'hex',
    title: '没有卦',
    text: '没有卦钱还没有掷出去空白也是一种回答',
    sig: 'none',
    zhu: [],
    paint(g) {
      heading(g, '没有卦', 108);
      para(g, '钱还没有掷出去。空白，也是一种回答。', 230, { size: 26, align: 'center', font: F.kai });
    },
  }];
}
