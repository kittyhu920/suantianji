// 朱笔圈点的规则（眉批、账本旁注、通灵的“实话”共用）：正文是墨，朱色只留给数字（含小数与百分号）和句尾的“〇”。

const NUMBER = /\d+(?:\.\d+)?%?/g;

/** 文中数字所占的字序（UTF-16 下标）集合，供逐字排版的眉批使用 */
export function numberIndexes(text) {
  const hot = new Set();
  for (const m of text.matchAll(NUMBER)) for (let k = 0; k < m[0].length; k++) hot.add(m.index + k);
  return hot;
}

/** 把一句话切成 [{ t, num }]，num 为 true 的片段是要点朱的数字 */
export function segments(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index), num: false });
    out.push({ t: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), num: false });
  return out;
}
