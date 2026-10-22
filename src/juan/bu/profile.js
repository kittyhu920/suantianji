// 卜卷的观人术：从兆象、再灼、按住灼点前的犹豫、按住时的手抖里读出“不信率”、画像与账本旁的批语。
// 通用的阈值与问题情绪在 src/core/profile.js。

import { T, sec, pct, clamp, avg, questionMood } from '../../core/profile.js';
import { OMENS } from './omen.js';

const BASE_DOUBT = { ji: 0.08, xiaoji: 0.22, wuyou: 0.3, fuji: 0.72, yousui: 0.9 };

// 你有几成不信这道兆：兆的好坏只是底数，真正起作用的是你怎么问，以及你以前验过没有
export function readDisappoint(S, omenKey, lastVisit) {
  let p = BASE_DOUBT[omenKey] ?? 0.5;
  let reason = `这是一道${OMENS[omenKey].name}的兆`;
  const mood = questionMood(S.question);
  if (S.questionIsDefault) { p -= 0.03; reason = `这是一道${OMENS[omenKey].name}的兆，而你没有写自己的问题。不说出来的人，不信也藏得住`; }
  else if (mood === '期待') { p += 0.08; reason = '你写下的是盼头。盼得越多，越容易不信'; }
  else if (mood === '犹豫') { p += 0.05; reason = '你问的是“该不该”。问“该不该”的人，心里早有答案，只是怕兆不同意'; }
  else if (mood === '困惑') { p += 0.03; reason = '你问的是“为什么”。想要一个解释的人，很难被一道裂纹说服'; }
  else { p -= 0.02; reason = `这是一道${OMENS[omenKey].name}的兆，而你写的问题没有露出情绪`; }
  if (lastVisit?.verdict === 'wei') { p += 0.06; reason += '；何况你上回说没有应验，有了比较，就容易不信'; }
  else if (lastVisit?.verdict === 'yan') { p -= 0.05; reason += '；上回你说验了，这回你更愿意信'; }
  return { pct: pct(clamp(p, 0.03, 0.97)), reason };
}

// 你是哪一类人，我有几成把握
export function readPortrait(S) {
  const h = S.hesitations;
  const retries = Math.max(0, S.zhengCount - 1);
  let who;
  let why;
  if (retries >= 1) { who = '执念型'; why = `你不满意，又灼了 ${retries} 次`; }
  else if ((h.length && Math.max(...h) >= T.longThrow) || S.idle >= 1) {
    who = '犹疑型';
    why = h.length && Math.max(...h) >= T.longThrow ? `你在钻凿前停了 ${sec(Math.max(...h))} 秒` : '你停下来发过呆';
  } else if ((S.pickMs ?? 9e9) <= T.quickPick && avg(h) <= T.quickThrow) { who = '果决型'; why = '你选得快，按得也快'; }
  else { who = '随性型'; why = '你不快不慢，没在哪一步较劲'; }
  const clues = 3 + h.length + S.presses + (S.questionIsDefault ? 0 : 2) + S.idle + S.hidden + retries + (S.override ? 2 : 0);
  return { who, conf: clamp(0.5 + clues * 0.04, 0.5, 0.97), why, clues };
}

function shichenNote(hour) {
  if (hour >= 23 || hour < 5) return '深夜来卜，心里有事';
  if (hour < 9) return '一早就来卜，这件事压了你一夜';
  if (hour >= 19) return '忙完一天才来卜，这件事一直在等你';
  if (hour >= 17) return '傍晚来卜，这件事在心里搁了一天';
  return '白天抽空来卜，是忽然想起';
}

// 账本每一行旁边，大师的批语：他从这一行读出了什么
export function ledgerNotes(S, { domain, totalMs, portrait, decisive, jitterAvg }) {
  const h = S.hesitations;
  const longest = h.length ? h.indexOf(Math.max(...h)) : -1;
  return {
    来访时间: shichenNote(S.clock.getHours()),
    设备: matchMedia('(pointer: coarse)').matches ? '你把我揣在口袋里' : '你坐下来认真问',
    问的方向: domain ? domain.persona : '',
    命辞: S.questionIsDefault ? '你不肯说，我替你拟了一句' : '你肯写下来，就不是随便问问',
    选方向用时: S.pickMs == null ? '' : S.pickMs <= T.quickPick ? '你早就想好了要问什么' : S.pickMs >= T.slowPick ? '你在几件事之间犹豫过' : '',
    按住的手: jitterAvg == null ? '' : jitterAvg > 30 ? '你按着的时候，手在抖' : jitterAvg < 4 ? '你按得很稳，像早就知道结果' : '',
    每次按前犹豫: !h.length ? '' : Math.max(...h) >= T.longThrow ? `第${'一二三四五六七八九'[longest] || longest + 1}灼前停得最久——那是你最在乎的一刻` : Math.max(...h) <= T.quickThrow ? '你按得很快。是不在乎，还是不敢想' : '',
    再灼: S.zhengCount > 1 ? '你不认这道兆，也不认命' : '',
    王占曰: S.override ? '兆说凶，你偏要说吉' : '',
    静止超过八秒: S.idle ? '你发呆的时候，我在看你' : '',
    离开页面: S.hidden ? '你走开过，回来的时候，我还在' : '',
    总用时: totalMs >= T.longTotal ? '你花了很久，比你以为的久' : totalMs <= T.shortTotal ? '你很快就想知道答案' : '',
    我给你的画像: `这是从你给我的 ${portrait.clues} 条线索里拼出来的`,
    验辞: S.yanTotal ? '你每答一次，我就更会猜你下一次' : '',
    兆: decisive && OMENS[decisive.omen].tone === 'xiong' ? '凶兆，你会想忘掉，但忘不掉' : decisive ? '吉兆，你会记得很久' : '',
  };
}
