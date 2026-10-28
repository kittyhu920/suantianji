// 命书的页（docs/DESIGN.md §19）：仪式完了，书摊开，里面是它替你写的命书，只用来读。
// 每一页是一个描述 { id, text, sig, zhu, paint(g) }：
//   id     页的名字（Reader 用它认页）
//   title  页标题：读屏软件按它认页、翻页时读出来（Reader 里隐藏的 <article> 的标题）；没有就读“第 N 页”
//   text   这一页上会出现的字（画之前先等字体加载）
//   sig    内容的签名：变了（通灵回话、同类人的数字到了）Reader 就重画这一页，不变就不重画
//   zhu    这一页用到的术语，页脚显示它们的注（core/book/notes.js）
//   paint  在已经铺好纸的画布上画（设计尺寸 PW × PH，见 paint.js），可以是 async
// 各卷自己的页（签文、卦、兆……）在 src/juan/<id>/book.js，这里是各卷通用的：扉页、判词、坦白、通灵、账本、命盘、四种结局，
// 以及把它们按顺序拼成一本书的 composeBook。

import { weave } from '../loom.js';
import { C, F, PW, PH, MARGIN, heading, para, rule, seal } from './paint.js';
import { flow, drawOps } from './flow.js';

/** 账本末尾的隐私说明：与 stat-schema.js 里的字段、关于页保持一致（docs/DESIGN.md §16） */
export const PRIVACY = '不过，每局结束时，我会匿名记一条统计：哪一卷、问的方向、结局、这一局的结果、用时的大致档次、有没有写问题、问题属于哪一类（只记类别，不记原文），还有昼夜主题。不记你的 IP，不用 cookie，也不会和这本账连起来。';

const caption = (g, text, y) => para(g, text, y, { size: 19, color: C.goldDim, align: 'center', font: F.kai });

/** 扉页：这一卷，以及你的问题 */
export function frontispiece({ juan, domain, question, date, seed }) {
  const q = question || '（没有写下具体的问题）';
  return {
    id: 'front',
    title: '扉页',
    text: `演算天机命书${juan.name}${juan.title}所问${domain?.name ?? ''}${domain?.desc ?? ''}${q}${date}`,
    sig: 'front',
    zhu: [],
    paint(g) {
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';
      g.font = `21px ${F.display}`;
      g.fillStyle = C.goldSoft;
      g.fillText('演 算 天 机', PW / 2, 78);
      g.font = `50px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText('命 书', PW / 2, 138);
      rule(g, 160, PW / 2 - 60, PW / 2 + 60);
      g.font = `230px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(juan.name, PW / 2, 360);
      g.font = `38px ${F.display}`;
      g.fillText([...juan.title].join(' '), PW / 2, 428);
      rule(g, 470);
      g.font = `21px ${F.kai}`;
      g.fillStyle = C.goldDim;
      g.fillText('所问', PW / 2, 520);
      g.font = `34px ${F.display}`;
      g.fillStyle = C.gold;
      g.fillText(domain ? `${domain.name}　${domain.desc.replaceAll(' · ', '　')}` : '未选方向', PW / 2, 566);
      g.font = `21px ${F.kai}`;
      g.fillStyle = C.goldDim;
      g.fillText('你写的问题', PW / 2, 624);
      para(g, q, 638, { size: 34, font: F.voice, align: 'center', color: C.gold, lh: 1.5, x: MARGIN + 20, w: PW - MARGIN * 2 - 40 });
      g.font = `18px ${F.text}`;
      g.fillStyle = C.goldDim;
      g.textAlign = 'left';
      g.fillText(date, MARGIN, PH - 40);
      seal(g, PW - MARGIN - 28, PH - 62, 56, '命', seed);
    },
  };
}

/** 判词：结局的印、名、引语与转折句。结局名与印用朱（最终判词） */
export function verdict({ ending, lead, turn, seed }) {
  return {
    id: 'verdict',
    title: '判词',
    text: `判词${ending.name}${ending.sub}${lead}${ending.verse.join('')}${turn.join('')}`,
    sig: 'verdict',
    zhu: [],
    paint(g) {
      heading(g, '判词', 108);
      seal(g, PW / 2 - 150, 250, 110, ending.name[0], seed);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.font = `84px ${F.display}`;
      g.fillStyle = C.cinnabar;
      g.fillText(ending.name, PW / 2 - 70, 262);
      g.font = `22px ${F.text}`;
      g.fillStyle = C.goldSoft;
      g.fillText([...ending.sub].join(' '), PW / 2 - 66, 304);
      let y = para(g, lead, 360, { size: 24, align: 'center', lh: 1.75 });
      y += 18;
      g.textAlign = 'center';
      g.font = `32px ${F.display}`;
      g.fillStyle = C.gold;
      for (const line of ending.verse) { g.fillText(line, PW / 2, y + 32); y += 52; }
      y += 34;
      g.font = `28px ${F.display}`;
      for (const line of turn) { g.fillText(line, PW / 2, y + 28); y += 44; }
    },
  };
}

/** 坦白：旁批里的数字是怎么从你身上算出来的；通灵回来的实话放最前。peer 是"和你一样的人"那一句 */
export function confessPages({ items, peer, critique }) {
  const blocks = items.map((it) => ({ k: 'p', text: it.text, size: 22, font: it.ai ? F.kai : F.text, gap: 14 }));
  if (peer) blocks.push({ k: 'p', text: peer, size: 22, gap: 14 });
  blocks.push({ k: 'sp', h: 10 });
  blocks.push({ k: 'p', text: critique, size: 22, font: F.kai, color: C.goldSoft });
  const pages = flow(blocks);
  return pages.map((ops, i) => ({
    id: `confess${i}`,
    title: i ? '实话（续）' : '跟你说几句实话',
    text: ops.map((o) => o.text).join(''),
    sig: `confess${i}:${ops.map((o) => o.text).join('|')}`,
    zhu: [],
    paint(g) {
      heading(g, i ? '实话（续）' : '跟你说几句实话', 108);
      drawOps(g, ops);
    },
  }));
}

/** 通灵：请大师细说之后，AI 用大白话写的解读 */
export function oraclePages({ title, text }) {
  const pages = flow([{ k: 'p', text, size: 23, font: F.kai, gap: 14 }]);
  return pages.map((ops, i) => ({
    id: `oracle${i}`,
    title: i ? `${title}（续）` : title,
    text: `${title}${ops.map((o) => o.text).join('')}`,
    sig: `oracle${i}:${text.length}`,
    zhu: [],
    paint(g) {
      heading(g, i ? `${title}（续）` : title, 108);
      drawOps(g, ops);
    },
  }));
}

/** 行为账本：刚才的每一步，每行一条旁注；最后是匿名统计的说明 */
export function ledgerPages({ rows, privacy }) {
  const blocks = [
    { k: 'p', text: '刚才的每一步，我都记下了。后面那幅图，就是用这些织成的。账本里的细节只存在你自己的设备上。', size: 21, font: F.kai, color: C.goldSoft, gap: 16 },
    ...rows.map((r) => ({ k: 'kv', key: r.k, value: r.v, note: r.note })),
    { k: 'sp', h: 8 },
    { k: 'p', text: privacy, size: 19, font: F.kai, color: C.goldDim },
  ];
  const pages = flow(blocks);
  return pages.map((ops, i) => ({
    id: `ledger${i}`,
    title: i ? '行为账本（续）' : '行为账本',
    text: ops.map((o) => o.text).join(''),
    sig: `ledger${i}`,
    zhu: [],
    paint(g) {
      heading(g, i ? '行为账本（续）' : '行为账本', 108);
      drawOps(g, ops);
    },
  }));
}

/** 命盘：由这一局的行为数据织成的锦 */
export function loomPage({ seed, throws, style, text, legend }) {
  return {
    id: 'loom',
    title: '命盘',
    text: `命盘${text}${legend}`,
    sig: 'loom',
    zhu: [],
    async paint(g) {
      heading(g, '命盘', 108);
      const w = PW - MARGIN * 2;
      const h = w * 0.75;
      const cv = document.createElement('canvas');
      await weave(cv, { seed, throws, width: Math.round(w * 1.6), style });
      g.drawImage(cv, MARGIN, 160, w, h);
      g.strokeStyle = C.goldFaint;
      g.lineWidth = 2;
      g.strokeRect(MARGIN, 160, w, h);
      let y = caption(g, text, 160 + h + 18);
      y = para(g, legend, y + 12, { size: 20, font: F.kai, color: C.goldSoft, lh: 1.7 });
    },
  };
}

/** 四种结局：只揭示得到过的，没得到的连名字和触发方式都不说，留给下一次 */
export function endingsPage({ endings, got, current, note }) {
  const all = Object.entries(endings);
  const count = all.filter(([k]) => got.includes(k)).length;
  return {
    id: 'endings',
    title: `结局，已得 ${count} 个，共 ${all.length} 个`,
    text: `四种结局已得${count}${all.map(([k, e]) => (got.includes(k) ? `${e.name}${e.sub}` : '')).join('')}未得还没有人告诉你这一次得到过${note ?? ''}`,
    sig: 'endings',
    zhu: [],
    paint(g) {
      heading(g, `结局 · 已得 ${count} / ${all.length}`, 108, 34);
      let y = 190;
      all.forEach(([key, e], i) => {
        const has = got.includes(key);
        const cx = MARGIN + 36;
        if (has) seal(g, cx, y + 40, 64, e.name[0], 11 + i);
        else {
          g.strokeStyle = C.goldFaint;
          g.lineWidth = 2;
          g.strokeRect(cx - 32, y + 8, 64, 64);
          g.font = `34px ${F.display}`;
          g.fillStyle = C.goldDim;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('?', cx, y + 42);
        }
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.font = `34px ${F.display}`;
        g.fillStyle = has ? C.gold : C.goldDim;
        g.fillText(has ? `${e.name} · ${e.sub}` : '未得', MARGIN + 92, y + 40);
        g.font = `20px ${F.kai}`;
        g.fillStyle = C.goldSoft;
        g.fillText(has ? (key === current ? '这一次' : '得到过') : '还没有人告诉你', MARGIN + 94, y + 72);
        y += 112;
      });
      if (note) para(g, note, y + 20, { size: 20, font: F.kai, color: C.goldSoft, lh: 1.7 });
    },
  };
}

/**
 * 把一卷的命书按顺序拼起来：扉页 → 结果页 → 过程记录 → 判词 → 坦白 →（通灵）→ 账本 → 命盘 → 四种结局。
 * 各卷自己的部分（results、records）是页描述的数组，其余是通用页的参数。
 */
export function composeBook({ front, results, records, verdict: v, confess, oracle, ledger, loom, endings }) {
  return [
    frontispiece(front),
    ...results,
    ...records,
    verdict(v),
    ...confessPages(confess),
    ...(oracle?.text ? oraclePages(oracle) : []),
    ...ledgerPages(ledger),
    loomPage(loom),
    endingsPage(endings),
  ];
}
