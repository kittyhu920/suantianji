// 匿名统计的字段表：前端上报、functions/api/stat.js 的校验、作者统计页共用同一份。
// 一律枚举白名单：不在表里的值服务端直接拒收。

import { juans } from '../juan/index.js';
import { ATTITUDE } from './ending.js';
import { TONE_LABEL, TOPIC_KEYS, TOPIC_LABEL } from './question-class.js';

export const JUAN_IDS = juans.filter((j) => j.open).map((j) => j.id);
export const ENDING_KEYS = Object.values(ATTITUDE);
export const ENDING_LABEL = { zun: '遵', ni: '逆', po: '破', mi: '迷' };

export const DOMAIN_KEYS = ['gong', 'yuan', 'shen'];
export const DOMAIN_LABEL = { gong: '功名', yuan: '尘缘', shen: '身心' };

export const DUR_KEYS = ['lt1', '1-2', '2-5', 'gt5'];
export const DUR_LABEL = { lt1: '不到 1 分', '1-2': '1 至 2 分', '2-5': '2 至 5 分', gt5: '5 分以上' };
export const durBucket = (ms) => (ms < 60000 ? 'lt1' : ms < 120000 ? '1-2' : ms < 300000 ? '2-5' : 'gt5');

export const TONE_KEYS = Object.keys(TONE_LABEL);
export { TONE_LABEL, TOPIC_KEYS, TOPIC_LABEL };
export const THEME_KEYS = ['day', 'night'];
export const THEME_LABEL = { day: '昼', night: '夜' };

// 本局结果标识：每卷自己的取值范围
const OMEN_KEYS = ['ji', 'xiaoji', 'wuyou', 'fuji', 'yousui'];
export const OMEN_LABEL = { ji: '吉', xiaoji: '小吉', wuyou: '亡尤', fuji: '弗吉', yousui: '有祟' };
const intIn = (lo, hi) => (v) => /^\d{1,2}$/.test(v) && +v >= lo && +v <= hi;
export const RESULT_OK = {
  qian: intIn(0, 60), // 签号，0 是签头
  gua: intIn(1, 64), // 通行本卦序
  bu: (v) => OMEN_KEYS.includes(v), // 兆象
};

export const MAX_BODY = 512; // 字节；一条正常记录约 150
const FIELDS = ['juan', 'domain', 'ending', 'result', 'dur', 'asked', 'qtone', 'qtopic', 'theme'];

/** 校验并整理一条上报。通过返回 { ok: true, row }，否则 { ok: false, why } */
export function validateRound(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { ok: false, why: 'shape' };
  for (const k of Object.keys(b)) if (!FIELDS.includes(k)) return { ok: false, why: `unknown field ${k}` };
  const opt = (k, keys) => {
    const v = b[k];
    if (v == null) return [true, null];
    return typeof v === 'string' && keys.includes(v) ? [true, v] : [false, null];
  };
  if (typeof b.juan !== 'string' || !JUAN_IDS.includes(b.juan)) return { ok: false, why: 'juan' };
  if (typeof b.ending !== 'string' || !ENDING_KEYS.includes(b.ending)) return { ok: false, why: 'ending' };
  if (typeof b.dur !== 'string' || !DUR_KEYS.includes(b.dur)) return { ok: false, why: 'dur' };
  if (typeof b.asked !== 'boolean') return { ok: false, why: 'asked' };
  const [dOk, domain] = opt('domain', DOMAIN_KEYS);
  const [tOk, qtone] = opt('qtone', TONE_KEYS);
  const [pOk, qtopic] = opt('qtopic', TOPIC_KEYS);
  const [mOk, theme] = opt('theme', THEME_KEYS);
  if (!dOk) return { ok: false, why: 'domain' };
  if (!tOk) return { ok: false, why: 'qtone' };
  if (!pOk) return { ok: false, why: 'qtopic' };
  if (!mOk) return { ok: false, why: 'theme' };
  if (!b.asked && (qtone || qtopic)) return { ok: false, why: 'class without question' };
  let result = null;
  if (b.result != null) {
    if (typeof b.result !== 'string' || !RESULT_OK[b.juan](b.result)) return { ok: false, why: 'result' };
    result = b.result;
  }
  return { ok: true, row: { juan: b.juan, domain, ending: b.ending, result, dur: b.dur, asked: b.asked ? 1 : 0, qtone, qtopic, theme } };
}
