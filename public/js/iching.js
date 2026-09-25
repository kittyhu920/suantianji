// 火珠林三钱法：字=2，背=3
// 和 6 老阴(变)  7 少阳  8 少阴  9 老阳(变)

import { trueRandom } from './rng.js';

export function castLine(rand = trueRandom) {
  const coins = [0, 1, 2].map(() => (rand() < 0.5 ? 2 : 3));
  const sum = coins[0] + coins[1] + coins[2];
  return {
    coins,                     // 2=字 3=背
    sum,
    yang: sum === 7 || sum === 9,
    moving: sum === 6 || sum === 9,
    name: { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' }[sum],
  };
}

// 八卦：key = 初爻*4 + 二爻*2 + 三爻（阳=1）
const TRIGRAMS = { 7: '乾', 6: '兑', 5: '离', 4: '震', 3: '巽', 2: '坎', 1: '艮', 0: '坤' };
const ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];

// [上卦][下卦]
const NAMES = [
  ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遯', '天地否'],
  ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
];

function trigram(bits) {
  const key = (bits[0] ? 4 : 0) + (bits[1] ? 2 : 0) + (bits[2] ? 1 : 0);
  return TRIGRAMS[key];
}

// yangs: 自下而上六个布尔
export function hexagramName(yangs) {
  const lower = trigram(yangs.slice(0, 3));
  const upper = trigram(yangs.slice(3, 6));
  return NAMES[ORDER.indexOf(upper)][ORDER.indexOf(lower)];
}

export function transform(lines) {
  const ben = lines.map((l) => l.yang);
  const zhi = lines.map((l) => (l.moving ? !l.yang : l.yang));
  return { ben, zhi, benName: hexagramName(ben), zhiName: hexagramName(zhi) };
}

export const LINE_LABELS = ['初', '二', '三', '四', '五', '上'];
