// 书的话与记账的折行（docs/DESIGN.md §4）。
// 扉页很窄，一行只放得下四五个字，浏览器按字折行会把“犹豫”“第三签”“3.2 秒”拆到两行。
// 这里先把句子切成不可拆的“块”（词表里的词、数字、第几几、标点连着前一个字），再按“一行放几个字”断行：
//   · 只在块与块之间断，一个词不拆；
//   · 优先断在标点后面（一个分句不被拦腰截断），其次是词边界；
//   · 标点可以挂在行末（不占格），不会有一行以标点开头；
//   · 末行不要只剩一两个字：整体按“各行长短差不多”来排。
// 纯函数，不碰 DOM（tests/gloss-wrap.test.mjs 用它做检查）。

// 不可拆的词：书的话与记账里出现的两字以上的词。新增文案时把新词也放进来
export const WORDS = [
  '犹豫', '把握', '失望', '时辰', '签筒', '签条', '签诗', '签文', '圣杯', '阴杯', '笑杯', '筊杯', '掷筊', '神明', '大师', '命书', '判词', '存疑',
  '功名', '尘缘', '身心', '困惑', '期待', '手抖', '像素', '兆象', '兆枝', '兆干', '钻凿', '变爻', '老阳', '老阴', '少阳', '少阴', '十进制',
  '铜钱', '龟甲', '龟壳', '有祟', '弗吉', '亡尤', '小吉', '验辞', '命辞', '刻辞', '王占曰', '爻', '起卦', '一卦', '再灼', '对贞', '求签',
  '初爻', '上爻', '二爻', '三爻', '四爻', '五爻', '本卦', '变卦', '卦辞', '解卦', '解签', '重求', '再起', '摇签', '得签', '一签', '一杯', '一支',
  '第一', '第二', '第三', '第四', '第五', '第六', '这一签', '这一卦', '这一灼', '这道兆', '那一', '这一', '一次', '两次', '三次', '什么', '如果', '那个', '这个', '一个', '每个', '一页', '这一页', '合上', '翻开', '左下角', '不一样', '越来越', '想好', '懂你',
];

const NUM = '[0-9]+(?:\\.[0-9]+)?[%°]?';
const NTH = '第[零一二三四五六七八九十百0-9]+[支签次回卦爻处灼杯]?';
const SORTED = [...WORDS].sort((a, b) => b.length - a.length).join('|');
const ATOM = new RegExp(`${NUM}|${NTH}|${SORTED}|[\\s\\S]`, 'gu');
const OPEN = /^[“‘《（(]$/u;
const CLOSE = /^[，。：；、！？”’》）)…—·,.:;!?]$/u;

/** 把句子切成块：{ s: 文本, w: 占几格（不含后面连着的标点）, pw: 连着的标点占几格（只有排在行末才挂出去、不占格）, p: 以标点结尾 } */
export function units(text) {
  const out = [];
  let pendingOpen = '';
  for (const m of text.matchAll(ATOM)) {
    const a = m[0];
    if (/^\s$/u.test(a)) { if (out.length) { out[out.length - 1].s += a; out[out.length - 1].w += 0.2; } continue; } // 空格跟在前一块后面，窄窄的 0.2 格；断在它后面时去掉
    if (OPEN.test(a)) { pendingOpen += a; continue; }
    if (CLOSE.test(a) && out.length && !(a === '.' && /\d$/.test(out[out.length - 1].s))) {
      const u = out[out.length - 1];
      u.s += a;
      u.pw += [...a].length;
      u.p = true;
      continue;
    }
    out.push({ s: pendingOpen + a, w: [...a].length + [...pendingOpen].length, pw: 0, p: false });
    pendingOpen = '';
  }
  if (pendingOpen) out.push({ s: pendingOpen, w: [...pendingOpen].length, pw: 0, p: false });
  return out;
}

/**
 * 折行：每行最多 cap 格（单个块比 cap 还长就让它独占一行）。返回行的数组（每行一个字符串）。
 * 用动态规划，使各行长短接近，并奖励断在标点后、惩罚太短的末行。
 */
export function wrap(text, cap) {
  const us = units(text);
  const n = us.length;
  if (!n) return [];
  cap = Math.max(2, Math.floor(cap));
  const total = us.reduce((a, u) => a + u.w + u.pw, 0) - us[n - 1].pw;
  if (total <= cap) return [us.map((u) => u.s).join('').trim()];
  // best[i]：把前 i 个块排好的最小代价
  const best = new Array(n + 1).fill(Infinity);
  const from = new Array(n + 1).fill(0);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    let tot = 0;
    for (let j = i - 1; j >= 0; j--) {
      tot += us[j].w + us[j].pw;
      const w = tot - us[i - 1].pw; // 行末的标点挂在外面，行中的标点占格
      if (w > cap && j < i - 1) break; // 超了，除非这一行只有一个块
      const slack = Math.max(0, cap - w);
      let cost;
      if (i === n) {
        // 末行：太短（一两个字）重罚；其余按长短差一点点计
        cost = (w <= 2 ? 40 : 0) + slack * slack * 0.25;
      } else {
        cost = slack * slack + (us[i - 1].p ? 0 : 3.5); // 没断在标点后：拦腰截断一个分句
      }
      if (best[j] + cost < best[i]) { best[i] = best[j] + cost; from[i] = j; }
    }
  }
  const lines = [];
  for (let i = n; i > 0; i = from[i]) lines.unshift(us.slice(from[i], i).map((u) => u.s).join('').trim());
  return lines;
}
