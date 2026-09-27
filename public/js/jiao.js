// 掷筊：两片月牙形筊杯，一面平、一面凸，各有一半机会平面朝上
// 一平一凸为圣杯（神明应允），两平为笑杯（笑而不答，须再掷），两凸为阴杯（神明不允）
// 去掉须再掷的笑杯，每一杯终归圣杯 2/3、阴杯 1/3

import { trueRandom } from './rng.js';

export const CUP_NAMES = { sheng: '圣杯', xiao: '笑杯', yin: '阴杯' };
export const CUP_SHORT = { sheng: '圣', xiao: '笑', yin: '阴' };
export const CUP_LABELS = ['第一杯', '第二杯', '第三杯'];

const kindOf = (flat) => ({ 1: 'sheng', 2: 'xiao', 0: 'yin' })[flat[0] + flat[1]];

export function castJiao(rand = trueRandom) {
  const flat = [rand() < 0.5, rand() < 0.5];
  return { flat, kind: kindOf(flat) };
}
