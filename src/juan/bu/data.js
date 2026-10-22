// 卜卷的文案与小数据（全部是初稿，须审读）。兆象的映射规则在 omen.js，兆纹的生成在 crack.js。

import { OMENS } from './omen.js';

// 问事的三个方向，与签卷一致；每个方向配一句默认的命辞与它的“反问”，没写具体问题时用
export const DOMAINS = {
  gong: { name: '功名', desc: '学业与工作', persona: '你在意输赢', zheng: '此事其成', fan: '此事不其成' },
  yuan: { name: '尘缘', desc: '感情与人际', persona: '你在意别人', zheng: '此缘其合', fan: '此缘不其合' },
  shen: { name: '身心', desc: '健康与情绪', persona: '你在意自己', zheng: '此心亡忧', fan: '此心有忧' },
};

export const MAX_Q = 24; // 命辞最长字数：刻在甲上放不下太长的
export const SPOTS = [
  // 龟腹甲背面的钻凿位置（甲面 300 × 420 的坐标）；左右对称，靠近中缝的一侧是兆枝要朝向的一边
  { x: 84, y: 118 }, { x: 216, y: 118 },
  { x: 78, y: 214 }, { x: 222, y: 214 },
  { x: 84, y: 310 }, { x: 216, y: 310 },
];

// 占辞：王看了兆之后说的话。每种兆象两句，按种子取其一
export const ZHAN = {
  ji: ['王占曰：吉。', '王占曰：吉，其如所卜。'],
  xiaoji: ['王占曰：小吉。', '王占曰：小吉，行而慎之。'],
  wuyou: ['王占曰：亡尤。', '王占曰：亡尤，勿忧。'],
  fuji: ['王占曰：弗吉。', '王占曰：弗吉，勿用。'],
  yousui: ['王占曰：有祟，其有来艰。', '王占曰：有祟，勿轻举。'],
};
export const ZHAN_OVERRIDE = '王占曰：吉。'; // 兆凶，王改判

export const zhanOf = (omenKey, seed) => ZHAN[omenKey][(seed >>> 0) % 2];

// 兆序：一二三……刻在兆的旁边，记这是第几灼
const NUM = '〇一二三四五六七八九';
export const cnNum = (n) => (n < 10 ? NUM[n] : n === 10 ? '十' : `十${NUM[n - 10]}`);

// 干支纪日：2000-01-01 是戊午日（第 54 位，甲子为 0）
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
export function dayGanzhi(d = new Date()) {
  const day = (x) => Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
  const i = (((day(d) - day(new Date(2000, 0, 1)) + 54) % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}

/** 把一句辞按每列最多 max 字分成几列，尽量在“，：”后断开 */
export function wrapCols(text, max = 8) {
  const out = [];
  let cur = '';
  for (const clause of text.match(/[^，：；。]+[，：；。]?|[，：；。]/g) ?? []) {
    let rest = [...clause];
    while (rest.length) {
      const room = max - [...cur].length;
      if (rest.length <= room) { cur += rest.join(''); rest = []; }
      else if (cur && room < 3) { out.push(cur); cur = ''; }
      else { cur += rest.slice(0, room).join(''); rest = rest.slice(room); out.push(cur); cur = ''; }
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const ZHENREN = '宾'; // 贞人：本作里由大师担任（“宾”是殷墟卜辞里常见的贞人之一）

/** 前辞：某日卜，某贞： */
export const qianci = (d = new Date()) => `${dayGanzhi(d)}卜，${ZHENREN}贞：`;

/** 反过来问的默认写法：没写具体问题时用方向自带的；写了就在前面加一个“不” */
export function fanOf(question, domainKey) {
  const d = DOMAINS[domainKey];
  if (d && question === d.zheng) return d.fan;
  if (question.startsWith('不')) return question.slice(1) || question;
  return `不${question}`;
}

// 四态结局（键沿用 zun / ni / po / mi）
export const ENDINGS = {
  zun: {
    name: '遵兆', sub: '依兆而行',
    verse: ['龟甲一灼纹自开', '吉凶不待人安排', '照兆而行无二问', '裂处皆是我写来'],
    lead: { ji: '兆是吉的，你顺着受了。', ping: '兆不上不下，你也受了。', xiong: '兆是凶的，你还是受了。' },
    critique: '你受了我读出的兆。其实兆纹是程序按你按住的那几秒长出来的，吉凶是我定的规矩。你越肯信，我越不必解释。',
    hint: '照兆受下。',
  },
  ni: {
    name: '改判', sub: '王占自作',
    verse: ['兆里分明弗吉言', '王占偏说是吉祥', '刻字入甲留千载', '裂纹无声自不忘'],
    lead: { ji: '兆是凶的，你以王的身份改成了吉。', ping: '兆是凶的，你以王的身份改成了吉。', xiong: '兆是凶的，你以王的身份改成了吉。' },
    critique: '兆纹说凶，你偏要刻成吉。刻在甲上的是你的话，不是裂纹的话——后人读到的，向来是占辞，不是兆。',
    hint: '兆凶，你偏说吉。',
  },
  po: {
    name: '破兆', sub: '龟甲无言',
    verse: ['炭火未冷手先收', '不信裂纹信自身', '龟甲本来无一语', '是人替它说吉凶'],
    lead: { ji: '你没有等兆说完。', ping: '你没有等兆说完。', xiong: '你没有等兆说完。' },
    critique: '你在半路按下了“存疑”。裂纹本来就不会说话，是我替它说；你不再听，它就只是一道裂。',
    hint: '犹豫的时候，留意画面左下角。',
  },
  mi: {
    name: '迷灼', sub: '求吉不已',
    verse: ['一灼不吉再灼之', '三灼仍求说好词', '龟甲千疮终无语', '是你不肯信自己'],
    lead: { ji: '兆已经是吉，你还想再灼。', ping: '兆不上不下，你想灼出一个更好的。', xiong: '你想把凶兆灼掉。' },
    critique: '你一灼再灼，想灼出一个更好的兆。每灼一次，我就多看清你一分。你越想要吉，我越知道你想听什么。',
    hint: '不满意，就一直再灼。',
  },
};

// 验辞：回答与眉批
export const YAN = {
  yan: { label: '验了', gloss: '验了。我记下了', short: '验' },
  wei: { label: '没验', gloss: '没验。这也记下', short: '未验' },
  wang: { label: '不记得了', gloss: '不记得也好，我替你记着', short: '不记得' },
};

export const omenName = (k) => OMENS[k].name;

// 解兆：这道兆在说什么，以及三个方向上的建议（原创，不是史料）
export const BAI = {
  ji: '事情顺着你的方向去。不用急着证明什么，照你原来的打算走。',
  xiaoji: '有得有失。大方向是顺的，但会在小处让你让一步。',
  wuyou: '不惊不险。没有大好，也没有大坏，是适合稳住的时候。',
  fuji: '现在不是动手的时候。不是不能做，而是力道不够，换个时机或换个办法。',
  yousui: '有你没看到的阻碍。先别硬闯，把能确认的事先确认一遍。',
};
export const ADVICE = {
  ji: { gong: '该争取的就争取，机会不会等你准备得完美。', yuan: '有话就说，对方比你以为的更愿意听。', shen: '状态在回升，别逼自己，也别拖着。' },
  xiaoji: { gong: '能成，但要在细节上让一步，别和人较劲。', yuan: '关系是顺的，小误会难免，说开就好。', shen: '大体无碍，留意作息，小毛病别拖。' },
  wuyou: { gong: '守住现有的，别冒进，也不必慌。', yuan: '不必急着定义关系，相处比结论重要。', shen: '平稳，保持现在的节奏就好。' },
  fuji: { gong: '先别下注，补足短处再动手。', yuan: '现在说重话容易伤人，等一等。', shen: '你比你以为的累，先歇一歇。' },
  yousui: { gong: '有你没算到的变数，先把风险列出来。', yuan: '有话压在心里，找个信得过的人说。', shen: '别硬撑，该看医生就去看。' },
};

export const copy = {
  posterTitle: '保存这一卜',
  posterAlt: '这一卜的结果图',
  posterWait: '正在为你刻甲……',
};
