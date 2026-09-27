// 大师的观人术：旁批里报出的数字都从玩家的行为算出来，结局时再坦白是怎么算的。
// 真实的算命先生靠察言观色，推荐算法是大规模的察言观色——这里把两者对上。
// 阈值集中在这里，调手感只改这一处。

export const T = {
  quickPick: 2000, // 选方向在这之内：早就想好了
  slowPick: 8000, // 超过这个：在几件事之间犹豫
  quickThrow: 1500, // 掷前停顿在这之内：掷得很快
  longThrow: 6000, // 超过这个：犹豫、在乎（不用三秒这种短时间下结论）
  longTotal: 180000, // 一局超过三分钟：花了很久
  shortTotal: 90000, // 一局不到一分半：很快就想知道答案
};

const sec = (ms) => (ms / 1000).toFixed(1);
const pct = (x) => Math.round(x * 100);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// 从写下的问题里读情绪
export function questionMood(q) {
  if (!q) return null;
  if (/该不该|要不要|能不能|会不会|是否/.test(q)) return '犹豫';
  if (/为什么|怎么|如何/.test(q)) return '困惑';
  return '期待';
}

const BASE_DISAPPOINT = { '上上': 0.08, '上吉': 0.21, '中平': 0.47, '下': 0.71, '下下': 0.89 };
const TONE = { '上上': 'ji', '上吉': 'ji', '中平': 'ping', '下': 'xiong', '下下': 'xiong' };

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

// 你有几成会失望：签的好坏只是底数，真正起作用的是你怎么问
export function readDisappoint(S, sign, lastVisit, signs) {
  let p = BASE_DISAPPOINT[sign.level] ?? 0.5;
  let reason = `这是一支${sign.level}签`;
  const mood = questionMood(S.question);
  if (mood === '期待') { p += 0.08; reason = '你写下的是盼头。盼得越多，越容易失望'; }
  else if (mood === '犹豫') { p += 0.05; reason = '你问的是“该不该”。问“该不该”的人，心里早有答案，只是怕签不同意'; }
  else if (mood === '困惑') { p += 0.03; reason = '你问的是“为什么”。想要一个解释的人，很难被一支签说服'; }
  else { p -= 0.04; reason = `这是一支${sign.level}签，而你什么也没写。不说出来的人，失望也藏得住`; }
  const last = lastVisit && signs.find((s) => s.name === lastVisit.name);
  if (last && last.name !== sign.name && TONE[last.level] === 'ji' && TONE[sign.level] !== 'ji') {
    p += 0.06;
    reason += `；何况你上次抽到的是“${last.name}”，有了比较，就容易失望`;
  }
  return { pct: pct(clamp(p, 0.03, 0.97)), reason };
}

// 你是哪一类人，我有几成把握
export function readPortrait(S) {
  const h = S.hesitations;
  const redraws = Math.max(0, S.draws - 1);
  let who;
  let why;
  if (redraws >= 1) { who = '执念型'; why = `你不认签，又求了 ${redraws} 次`; }
  else if ((h.length && Math.max(...h) >= T.longThrow) || S.idle >= 1) {
    who = '犹疑型';
    why = h.length && Math.max(...h) >= T.longThrow ? `你在一杯前停了 ${sec(Math.max(...h))} 秒` : '你停下来发过呆';
  } else if ((S.pickMs ?? 9e9) <= T.quickPick && avg(h) <= T.quickThrow) { who = '果决型'; why = '你选得快，掷得也快'; }
  else { who = '随性型'; why = '你不快不慢，没在哪一步较劲'; }
  const clues = 3 + h.length + S.shakeTries + (S.question ? 2 : 0) + S.idle + S.hidden + redraws;
  return { who, conf: clamp(0.5 + clues * 0.04, 0.5, 0.97), why, clues };
}

function shichenNote(hour) {
  if (hour >= 23 || hour < 5) return '深夜来问，心里有事';
  if (hour < 9) return '一早就来问，这件事压了你一夜';
  if (hour >= 19) return '忙完一天才来问，这件事一直在等你';
  if (hour >= 17) return '傍晚来问，这件事在心里搁了一天';
  return '白天抽空来问，是忽然想起';
}

// 账本每一行旁边，大师的朱批：他从这一行读出了什么
export function ledgerNotes(S, { domain, sign, totalMs, portrait }) {
  const h = S.hesitations;
  const redraws = Math.max(0, S.draws - 1);
  const longest = h.length ? h.indexOf(Math.max(...h)) : -1;
  return {
    来访时辰: shichenNote(S.clock.getHours()),
    设备: matchMedia('(pointer: coarse)').matches ? '你把我揣在口袋里' : '你坐下来认真问',
    问的方向: domain ? domain.persona : '',
    你写的问题: S.question ? '你肯写下来，就不是随便问问' : '你不肯说，我也猜得到几分',
    选方向用时: S.pickMs == null ? '' : S.pickMs <= T.quickPick ? '你早就想好了要问什么' : S.pickMs >= T.slowPick ? '你在几件事之间犹豫过' : '',
    摇签: S.shakeTries > 1 ? '你停了又摇，像在等一个更好的时机' : '',
    得签: !sign ? '' : TONE[sign.level] === 'ji' ? '好签，你会记得很久' : TONE[sign.level] === 'xiong' ? '坏签，你会想忘掉，但忘不掉' : '平签，最让人不甘心',
    每次掷前犹豫: !h.length ? '' : Math.max(...h) >= T.longThrow ? `第${'一二三四五六七八九'[longest] || longest + 1}次掷前停得最久——那是你最在乎的一刻` : Math.max(...h) <= T.quickThrow ? '你掷得很快。是不在乎，还是不敢想' : '',
    重求签: redraws ? '你不认签，也不认命' : '',
    掷筊: S.throws.some((t) => t.kind === 'yin') ? '神明说过一次“不”' : '',
    静止超过八秒: S.idle ? '你发呆的时候，我在看你' : '',
    离开页面: S.hidden ? '你走开过，回来的时候，我还在' : '',
    总用时: totalMs >= T.longTotal ? '你花了很久，比你以为的久' : totalMs <= T.shortTotal ? '你很快就想知道答案' : '',
    我给你的画像: `这是从你给我的 ${portrait.clues} 条线索里拼出来的`,
  };
}
