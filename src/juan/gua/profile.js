// 卦卷的观人术：从变爻的多少、起卦的次数、掷之前的犹豫里读出"你会不会再起一卦"、画像与账本旁的批语。
// 通用的阈值与问题情绪在 src/core/profile.js。

import { T, sec, pct, clamp, avg, questionMood } from '../../core/profile.js';

// 变爻越多，卦越不稳，越想再起一卦——这是我拿来猜你的底数
const BASE_RECAST = [0.14, 0.27, 0.4, 0.52, 0.62, 0.7, 0.78];

// 你有几成会再起一卦：变爻只是底数，真正起作用的是你怎么问
export function readRecast(S, nMoving, lastVisit) {
  let p = BASE_RECAST[nMoving] ?? 0.5;
  let reason = nMoving ? `这一卦有 ${nMoving} 个变爻，变爻越多越不安稳` : '这一卦没有变爻，安安静静的';
  const mood = questionMood(S.question);
  if (mood === '期待') { p += 0.08; reason = '你写下的是盼头。盼得越多，越想再起一卦'; }
  else if (mood === '犹豫') { p += 0.06; reason = '你问的是“该不该”。问“该不该”的人，心里早有答案，只是怕卦不同意'; }
  else if (mood === '困惑') { p += 0.03; reason = '你问的是“为什么”。想要一个解释的人，很难被一个卦说服'; }
  else { p -= 0.04; reason += '，而你什么也没写。不说出来的人，再起一卦也藏得住'; }
  if (lastVisit) { p += 0.03; reason += `；何况你上次得的是“${lastVisit.name}”，有了比较，就容易再起`; }
  return { pct: pct(clamp(p, 0.03, 0.97)), reason };
}

// 你是哪一类人，我有几成把握
export function readPortrait(S) {
  const h = S.hesitations;
  const redraws = Math.max(0, S.casts.length - 1);
  let who;
  let why;
  if (redraws >= 1) { who = '执念型'; why = `你不认这一卦，又起了 ${redraws} 卦`; }
  else if ((h.length && Math.max(...h) >= T.longThrow) || S.idle >= 1) {
    who = '犹疑型';
    why = h.length && Math.max(...h) >= T.longThrow ? `你在一爻前停了 ${sec(Math.max(...h))} 秒` : '你停下来发过呆';
  } else if ((S.pickMs ?? 9e9) <= T.quickPick && avg(h) <= T.quickThrow) { who = '果决型'; why = '你选得快，掷得也快'; }
  else { who = '随性型'; why = '你不快不慢，没在哪一步较劲'; }
  const clues = 3 + h.length + S.shakeTries + (S.question ? 2 : 0) + S.idle + S.hidden + redraws;
  return { who, conf: clamp(0.5 + clues * 0.03, 0.5, 0.97), why, clues };
}

function shichenNote(hour) {
  if (hour >= 23 || hour < 5) return '深夜来问，心里有事';
  if (hour < 9) return '一早就来问，这件事压了你一夜';
  if (hour >= 19) return '忙完一天才来问，这件事一直在等你';
  if (hour >= 17) return '傍晚来问，这件事在心里搁了一天';
  return '白天抽空来问，是忽然想起';
}

// 账本每一行旁边，大师的批语：他从这一行读出了什么
export function ledgerNotes(S, { domain, totalMs, portrait, nMoving }) {
  const h = S.hesitations;
  const redraws = Math.max(0, S.casts.length - 1);
  const longest = h.length ? h.indexOf(Math.max(...h)) : -1;
  return {
    来访时辰: shichenNote(S.clock.getHours()),
    设备: matchMedia('(pointer: coarse)').matches ? '你把我揣在口袋里' : '你坐下来认真问',
    问的方向: domain ? domain.persona : '',
    你写的问题: S.question ? '你肯写下来，就不是随便问问' : '你不肯说，我也猜得到几分',
    选方向用时: S.pickMs == null ? '' : S.pickMs <= T.quickPick ? '你早就想好了要问什么' : S.pickMs >= T.slowPick ? '你在几件事之间犹豫过' : '',
    摇卦: S.shakeTries > S.throws.length ? '你停了又摇，像在等一个更好的时机' : '',
    得卦: nMoving ? '有变爻，你多半不会安心' : '一个变爻也没有，最让人不甘心',
    每爻掷前犹豫: !h.length ? '' : Math.max(...h) >= T.longThrow ? `第${'一二三四五六七八九'[longest] || longest + 1}次掷前停得最久——那是你最在乎的一刻` : Math.max(...h) <= T.quickThrow ? '你掷得很快。是不在乎，还是不敢想' : '',
    重起卦: redraws ? '你不认卦，也不认命' : '',
    静止超过八秒: S.idle ? '你发呆的时候，我在看你' : '',
    离开页面: S.hidden ? '你走开过，回来的时候，我还在' : '',
    总用时: totalMs >= T.longTotal ? '你花了很久，比你以为的久' : totalMs <= T.shortTotal ? '你很快就想知道答案' : '',
    我给你的画像: `这是从你给我的 ${portrait.clues} 条线索里拼出来的`,
  };
}
