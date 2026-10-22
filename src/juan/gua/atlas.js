// 卦谱的数据：六十四卦怎么排、哪些卜到过。图谱的界面以后统一做（src/core/atlas），这里只提供数据。
//
//   atlas.cells        六十四格，每格 { no, name, bin, upper, lower, value }（value 是先天序里的位置 0–63，坤 0 乾 63）
//   atlas.layouts      三种排法，值都是卦序号（1–64）：
//     bagong   京房八宫：8 宫 × 8 卦，每宫自本宫卦起，依次是一世、二世、三世、四世、五世、游魂、归魂
//     fangtu   先天方图：8 × 8，行是上卦、列是下卦，两个方向都按先天八卦的次序（乾兑离震巽坎艮坤）
//     yuantu   先天圆图的次序：按二进制 0–63 排（坤 0、复 1、师 2 … 夬 62、乾 63），首尾相接成一圈
//   atlas.seen(store)  已卜到过的卦序号（store 是 ctx.store，本卷自己的命名空间）
//   atlas.mark(store, no)  记下一卦

import db from './gua.json';
import { xiantianValue } from './yao.js';

const byName = new Map(db.hexagrams.map((h) => [h.name, h]));
const no = (name) => {
  const h = byName.get(name);
  if (!h) throw new Error(`卦谱：找不到卦“${name}”`);
  return h.no;
};

// 京房八宫（每宫八卦：本宫、一世、二世、三世、四世、五世、游魂、归魂）
const BAGONG = [
  ['乾宫', ['乾', '姤', '遁', '否', '观', '剥', '晋', '大有']],
  ['坎宫', ['坎', '节', '屯', '既济', '革', '丰', '明夷', '师']],
  ['艮宫', ['艮', '贲', '大畜', '损', '睽', '履', '中孚', '渐']],
  ['震宫', ['震', '豫', '解', '恒', '升', '井', '大过', '随']],
  ['巽宫', ['巽', '小畜', '家人', '益', '无妄', '噬嗑', '颐', '蛊']],
  ['离宫', ['离', '旅', '鼎', '未济', '蒙', '涣', '讼', '同人']],
  ['坤宫', ['坤', '复', '临', '泰', '大壮', '夬', '需', '比']],
  ['兑宫', ['兑', '困', '萃', '咸', '蹇', '谦', '小过', '归妹']],
];

const XIANTIAN = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']; // 先天八卦的次序

const cells = db.hexagrams.map((h) => ({ no: h.no, name: h.name, bin: h.bin, upper: h.upper, lower: h.lower, value: xiantianValue(h.bin) }));
const byValue = new Map(cells.map((c) => [c.value, c.no]));

export const atlas = {
  id: 'gua',
  title: '卦谱',
  cells,
  layouts: {
    bagong: BAGONG.map(([gong, names]) => ({ gong, items: names.map(no) })),
    fangtu: XIANTIAN.map((up) => XIANTIAN.map((lo) => db.hexagrams.find((h) => h.upper === up && h.lower === lo).no)),
    yuantu: Array.from({ length: 64 }, (_, v) => byValue.get(v)),
  },
  seen: (store) => store.get('seen', []),
  mark(store, n) {
    const got = new Set(store.get('seen', []));
    got.add(n);
    store.set('seen', [...got].sort((a, b) => a - b));
    return [...got];
  },
};
