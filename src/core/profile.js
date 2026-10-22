// 大师的观人术（通用部分）：旁批里报出的数字都从玩家的行为算出来，结局时再坦白是怎么算的。
// 真实的算命先生靠察言观色，推荐算法是大规模的察言观色——这里把两者对上。
// 阈值集中在这里，调手感只改这一处。各卷特有的判断（签级的失望率、掷前犹豫的画像、账本的朱批）在各卷自己的 profile.js。

export const T = {
  quickPick: 2000, // 选方向在这之内：早就想好了
  slowPick: 8000, // 超过这个：在几件事之间犹豫
  quickThrow: 1500, // 掷前停顿在这之内：掷得很快
  longThrow: 6000, // 超过这个：犹豫、在乎（不用三秒这种短时间下结论）
  longTotal: 180000, // 一局超过三分钟：花了很久
  shortTotal: 90000, // 一局不到一分半：很快就想知道答案
};

export const sec = (ms) => (ms / 1000).toFixed(1);
export const pct = (x) => Math.round(x * 100);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// 从写下的问题里读情绪
export function questionMood(q) {
  if (!q) return null;
  if (/该不该|要不要|能不能|会不会|是否/.test(q)) return '犹豫';
  if (/为什么|怎么|如何/.test(q)) return '困惑';
  return '期待';
}

// 我有几成把握猜中你：看你下决定快不快、肯不肯把心事写下来
export function readSure(S) {
  let score = 0.62;
  const reasons = [];
  if (S.question) { score += 0.1; reasons.push('你把问题写了下来，等于把心事交给了我'); }
  if (S.pickMs != null && S.pickMs <= T.quickPick) { score += 0.12; reasons.push(`你选方向只用了 ${sec(S.pickMs)} 秒——答得越快的人，越好猜`); }
  else if (S.pickMs != null && S.pickMs >= T.slowPick) { score -= 0.08; reasons.push(`你选方向想了 ${sec(S.pickMs)} 秒，心里不止一件事，难猜一些`); }
  if (S.shakeTries === 1) score += 0.05;
  if (S.idle > 0) { score -= 0.06; reasons.push('你中途发过呆，那几秒我看不透'); }
  if (!reasons.length) reasons.push('你一路没怎么停，我顺着你的节奏猜');
  return { pct: pct(clamp(score, 0.51, 0.96)), reason: reasons.slice(0, 2).join('；') };
}
