// 结局坦白里"和你一样的人"那一句的模板。全部是大师的第一人称，都是初稿，待审读；改措辞只改这一处。
// 数字一律写成阿拉伯数字，显示时由 Note 点朱（marks.js）；"十个里有一个"这类口语说法用汉字，不点朱。
//
// 只用当天或近 7 天的聚合；样本少于 MIN_SAMPLE 局时不说数字，改说 NO_SAMPLE 里不带数字的一句。

import { DOMAIN_LABEL, ENDING_LABEL, TONE_LABEL, TOPIC_LABEL, OMEN_LABEL } from './stat-schema.js';

export const MIN_SAMPLE = 20;

const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];

// 各结局怎么称呼
const ENDING_WHO = {
  zun: '照单全收的',
  ni: '偏要逆着来的',
  po: '按下存疑印的',
  mi: '停不下来、一直重来的',
};

// 本局结果怎么称呼；量词因卷而异
const RESULT_NAME = {
  qian: (r) => `第 ${r} 签`,
  gua: (r) => `第 ${r} 卦`,
  bu: (r) => `${OMEN_LABEL[r] ?? r}兆`,
};
const RESULT_UNIT = { qian: '这一支', gua: '这一卦', bu: '这一道兆' };

const pct = (n, total) => Math.max(1, Math.round((n / total) * 100));
const inTen = (n, total) => CN[Math.min(10, Math.max(1, Math.round((n / total) * 10)))];

/**
 * agg：fetchAggregate 的返回；mine：{ juan, domain, ending, result, qtopic, qtone }；span："今天" 或 "这几天"
 * 返回所有这一局能说的句子（可能为空）。
 */
export function candidates(agg, mine, span) {
  const { n } = agg;
  const out = [];
  const share = (map, key) => (key && map?.[key] ? map[key] : 0);

  // 1 领域
  const d = share(agg.domains, mine.domain);
  if (d) out.push(`${span}来问${DOMAIN_LABEL[mine.domain]}的，有 ${pct(d, n)}%。你也是其中一个。`);

  // 2～4 结局：常见、居中、少见各一种说法
  const e = share(agg.endings, mine.ending);
  if (e) {
    const p = pct(e, n);
    const who = ENDING_WHO[mine.ending];
    if (p >= 40) out.push(`和你一样${who}，${span}有 ${p}%。你不孤单。`);
    else if (p > 15) out.push(`和你一样${who}，${span}有 ${p}%。`);
    else out.push(`像你这样${who}，${span}只有 ${p}%，算少数。`);
  }

  // 5～6 同一个结果
  const r = mine.result != null ? share(agg.results, String(mine.result)) : 0;
  const name = RESULT_NAME[mine.juan]?.(mine.result);
  if (name && r >= 2) out.push(`${span}得到${name}的，有 ${r} 位。`);
  if (name && r === 1) out.push(`${span}得到${name}的，才 ${r} 位。`);
  if (name && r >= 2 && inTen(r, n) !== '零') out.push(`和你一样拿到${RESULT_UNIT[mine.juan]}的，十个里有${inTen(r, n)}个。`);

  // 7 问题主题（"其他"不说）
  const t = share(agg.topics, mine.qtopic);
  if (t && mine.qtopic !== 'other') out.push(`${span}问${TOPIC_LABEL[mine.qtopic]}的，有 ${pct(t, n)}%。你的问题也在里面。`);

  // 8 问题语气
  const k = share(agg.tones, mine.qtone);
  if (k) out.push(`${span}写下的问题里，有 ${pct(k, n)}% 和你一样带着${TONE_LABEL[mine.qtone]}。`);

  return out;
}

// 样本太少时：不带数字的话
export const NO_SAMPLE = [
  '这几天来问的人还不多，我暂时没法把你放进人群里比。',
  '来的人还少，我先不说别人是什么样，只记你的。',
];

/** 选一句。seed 取命盘的种子：同一局每次打开都是同一句 */
export function pickLine(agg, mine, span, seed) {
  if (!agg) return null; // 读不到聚合（离线、本地预览）：什么也不说
  if (agg.n < MIN_SAMPLE) return NO_SAMPLE[seed % NO_SAMPLE.length];
  const all = candidates(agg, mine, span);
  return all.length ? all[seed % all.length] : null;
}
