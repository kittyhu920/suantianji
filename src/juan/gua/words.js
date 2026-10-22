// 卦卷的眉批（大师的批语）与几段较长的说明文字。全部是初稿，待审读。
// 眉批每条不超过 20 字，用第一人称"我"；tools/check-gua.mjs 会用 allGlosses() 逐条检查字数。
// 页面上其余的文案在各屏的 .svelte 里；64 卦的文案在 gua.json；注在 zhu.json；源流在 src/pages/gua/yuanliu.md。

const sec = (ms) => (ms / 1000).toFixed(1);

export const G = {
  // 入卷
  boot: '我开始留意你了',
  device: (coarse) => `你用的是${coarse ? '手机' : '电脑'}`,
  visits: (n) => `你第 ${n} 次来找我了`,
  last: (ago, name) => `${ago}你得的是${name}卦`,

  // 问事
  dingEnter: '起卦不看时辰，我看你的手',
  pick: (domain, ms, persona) => `你问${domain}，想了 ${sec(ms)} 秒。${persona}`,
  question: (n, mood) => `你写了 ${n} 个字，我读出了${mood}`,

  // 起卦
  castFirst: '三枚铜钱，掷六次，记六位',
  castAgain: (n) => `第 ${n} 回起卦，我数着呢`,
  hesitate: (ms) => `这一爻前，你停了 ${sec(ms)} 秒`,
  laoyang: '三背，老阳。它要变',
  laoyin: '三字，老阴。它也要变',
  bits: (bits) => `你掷出的是 ${bits}`,
  castDone: (name, nMoving) => `${name}卦。${nMoving ? `有 ${nMoving} 个变爻` : '没有变爻'}`,
  decimal: (n) => `换成十进制，是 ${n}`,
  predictRecast: (pct) => `我猜你 ${pct}% 会再起一卦`,
  sure: (pct) => `我有 ${pct}% 的把握猜中你`,

  // 解卦：受卦与再起
  meng: '初筮告，再三渎，渎则不告',
  mengAfter: '我提醒过你了',
  mengDone: '我本不该再告诉你',
  third: '第三卦了，你渎了两回',
  understand: '我越来越懂你了……',
  more: (n) => `第 ${n} 卦了，我还数着`,
  accept: '你受了这一卦',

  // 收尾
  portrait: (who, pct) => `你是${who}，把握 ${pct}%`,
  poster: '你想把我给的卦带走',
};

/** 把每一条眉批用最长的样例各展开一次，供检查字数 */
export function allGlosses() {
  const out = [];
  for (const [k, v] of Object.entries(G)) {
    if (typeof v === 'string') { out.push([k, v]); continue; }
    const samples = {
      device: [[true], [false]],
      visits: [[99]],
      last: [['十个月前', '噬嗑']],
      pick: [['功名', 99900, '你在意输赢'], ['尘缘', 99900, '你在意别人'], ['身心', 99900, '你在意自己']],
      question: [[40, '犹豫'], [40, '困惑'], [40, '期待']],
      castAgain: [[9]],
      hesitate: [[999999]],
      bits: [['101100']],
      castDone: [['噬嗑', 6], ['未济', 0], ['既济', 1]],
      decimal: [[63]],
      predictRecast: [[100]],
      sure: [[100]],
      more: [[99]],
      portrait: [['犹疑型', 100], ['执念型', 100]],
    }[k];
    for (const args of samples ?? []) out.push([k, v(...args)]);
  }
  return out;
}

// 结局页里讲莱布尼茨与先天八卦图的一节。<b> 里的内容由页面填。
export const BINARY = {
  title: '六十四卦，就是六位二进制',
  lead: '你以为自己在占卜，其实，你刚才是在生成一个数。',
  p1: (bits, n) => `阳爻记 1，阴爻记 0，六爻自下而上读出来，是 ${bits}。把最下面的初爻当作最低位，它就是十进制的 ${n}。六位二进制一共有 2 的 6 次方，也就是 64 种，正好是六十四卦。`,
  // p2 拆成几段，页面在“先天六十四卦图”“莱布尼茨”“二进制”上挂注
  p2: ['宋代的邵雍排过一幅“', '先天六十四卦图', '”，顺着图里的次序数下去，就是从 0 数到 63。十八世纪初，', '莱布尼茨', '从传教士白晋寄来的卦图里，认出了这个对应：他自己想出来的', '二进制', '，卦画早就用阴阳两画写过。'],
  p3: '不过要说清楚：古人排这幅图，并没有把它当数来算；把卦读成二进制，是后来的人看出来的。',
  p4: '所以刚才那六次掷钱，我什么神秘的事也没做：你每掷一次，我记一位；六位记满，就是一个 0 到 63 之间的数。接下来的每一句“这一卦说什么”，都是我照着这个数去查的表。',
};
