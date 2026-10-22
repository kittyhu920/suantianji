// 金钱卦的算法：三枚铜钱 → 一爻（六、七、八、九）→ 六爻 → 卦。纯函数，不碰页面。
//
// 约定（采用通行的"背为阳面"，各地说法不一，见 zhu.json 的"金钱卦"条）：
//   背记 3，字记 2，三枚相加：
//   三背      9  老阳  阳爻，变
//   两背一字  8  少阴  阴爻
//   一背两字  7  少阳  阳爻
//   三字      6  老阴  阴爻，变
// 二进制：阳爻 1，阴爻 0；变爻按它现在的阴阳记（老阳记 1，老阴记 0）。
// 六位自下而上，初爻在最左，与 gua.json 里的 bin 一致。

import { trueRandom } from '../../core/rng.js';

export const CN_YAO = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
export const CN_YAO_SHORT = ['初', '二', '三', '四', '五', '上'];

// v：这一爻的数；kind：命盘与账本里用的键
export const YAO = {
  9: { v: 9, kind: 'laoyang', name: '老阳', faces: '三背', yang: true, moving: true },
  8: { v: 8, kind: 'shaoyin', name: '少阴', faces: '两背一字', yang: false, moving: false },
  7: { v: 7, kind: 'shaoyang', name: '少阳', faces: '一背两字', yang: true, moving: false },
  6: { v: 6, kind: 'laoyin', name: '老阴', faces: '三字', yang: false, moving: true },
};
export const KIND_OF = Object.fromEntries(Object.values(YAO).map((y) => [y.v, y.kind]));

export const faceText = (f) => (f === 'bei' ? '背' : '字');

/** 掷一枚铜钱：背或字，各一半（真随机） */
export const tossCoin = (rand = trueRandom) => (rand() < 0.5 ? 'bei' : 'zi');

/** 三枚的朝向 → 这一爻的数 */
export const valueOf = (faces) => faces.reduce((n, f) => n + (f === 'bei' ? 3 : 2), 0);

export const isYang = (v) => v === 7 || v === 9;
export const isMoving = (v) => v === 6 || v === 9;
export const bitOf = (v) => (isYang(v) ? 1 : 0);

/** 六爻（数）→ 本卦的二进制字符串，自下而上 */
export const binOf = (vs) => vs.map(bitOf).join('');

/** 变爻变成它的反面：老阳（9）变阴，老阴（6）变阳；其余不动。返回变卦的二进制，没有变爻则为 null */
export function changedBin(vs) {
  if (!vs.some(isMoving)) return null;
  return vs.map((v) => (isMoving(v) ? 1 - bitOf(v) : bitOf(v))).join('');
}

/** 变爻之后每一爻的数（供画变卦用）：9 → 8，6 → 7 */
export const afterChange = (vs) => vs.map((v) => (v === 9 ? 8 : v === 6 ? 7 : v));

/** 先天序里的位置：把初爻当最低位，坤是 0，乾是 63 */
export const xiantianValue = (bin) => parseInt([...bin].reverse().join(''), 2);

export function indexByBin(db) {
  return new Map(db.hexagrams.map((h) => [h.bin, h]));
}
