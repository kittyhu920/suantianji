// 封面上的四个结局印位：遵、逆、破、迷，与命书结局页里每个结局前的那一方印是同一方（paint.js 的 seal()，种子 11 + 序号）。
// 得过的结局是完整一方朱印；没得过的只留空印框（框画在封面纹理与 Book.svelte 里）。
import { seal } from './paint.js';

export const SLOT_CHARS = ['遵', '逆', '破', '迷'];

/** 第 i 个结局的印（边长 px，正方，透明底） */
export function sealCanvas(i, px = 192) {
  // 先按大尺寸画（seal() 的剥蚀碎点是为大印定的，印小了碎点就显得太粗），再缩进去
  const s = 300;
  const T = Math.ceil(s * 1.5);
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = T;
  seal(tmp.getContext('2d'), T / 2, T / 2, s, SLOT_CHARS[i], 11 + i);
  const cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const k = (px * 0.86) / s;
  cv.getContext('2d').drawImage(tmp, px / 2 - (T / 2) * k, px / 2 - (T / 2) * k, T * k, T * k);
  return cv;
}
