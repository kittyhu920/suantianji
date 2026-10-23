// 卜卷：甲骨灼卜。卷的接口说明见 src/juan/index.js。
// 流程：（验辞）→ 命辞 → 灼 → 读兆 →（对贞 / 再灼）→ 王占曰 → 刻辞 → 观象。

import Title from './Title.svelte';
import Yan from './Yan.svelte';
import Ding from './Ding.svelte';
import Zhuo from './Zhuo.svelte';
import Ke from './Ke.svelte';
import End from './End.svelte';
import Defs from './Defs.svelte';
import zhu from './zhu.json';
import { createGame } from './game.svelte.js';
import { copy } from './data.js';
import { OMENS, OMEN_KEYS, RULES } from './omen.js';
import { store } from '../../core/store.js';

const ZIPAN = [
  '癸巳卜，宾贞：旬亡祸？王占曰：有祟，其有来艰。迄至五日丁酉，允有来艰自西。',
  '癸卯卜，今日雨？其自西来雨？其自东来雨？其自北来雨？其自南来雨？',
  '癸酉卜，争贞：旬亡祸？',
  '贞：翌日其雨？贞：翌日不其雨？',
  '贞：我受年？',
  '今夕亡祸？',
  '王占曰：吉。',
];

export default {
  id: 'bu',
  name: '卜',
  title: '甲骨灼卜',
  open: true,
  start: 'title',
  screens: { title: Title, yan: Yan, ding: Ding, zhuo: Zhuo, ke: Ke, end: End },
  steps: [{ k: 'ding', name: '命辞' }, { k: 'zhuo', name: '灼卜' }, { k: 'ke', name: '刻辞' }, { k: 'end', name: '观象' }],
  Defs, // 本卷的共享图形（滤镜）
  zhu,
  copy,
  enter: (ctx) => createGame(ctx),

  // 兆谱：已经卜到过的兆型。界面以后统一做（公共的图谱组件），这里只给数据。
  //   entries   五种兆象，附读法
  //   seen()    本机上卜到过的兆象键（读本卷命名空间 stj-bu-omens）
  atlas: {
    title: '兆谱',
    entries: OMEN_KEYS.map((k) => ({ key: k, name: OMENS[k].name, tone: OMENS[k].tone, line: OMENS[k].line, rule: RULES.find(([n]) => n === OMENS[k].name)?.[1] ?? '' })),
    seen: () => store.getJuan('bu', 'omens', []),
  },

  // 案上字盘用的字：甲骨卜辞释文的选段，用通行释文的楷书写法（不是甲骨文字形）。
  // 只留汉字；生僻、思源宋体没有字形的字（如“殻”）已换掉。与 zipanCite 一一对应；
  // 出处里的号码拿不准的不写（待对照《甲骨文合集》核对）。
  zipan: () => ZIPAN.join('').replace(/[^\p{Script=Han}]/gu, ''),
  zipanCite: [
    '《甲骨文合集》6057 正（节选；原文贞人名为生僻字，这里改作“宾”）',
    '《甲骨文合集》（号待核）',
    '《甲骨文合集》所收“贞旬”卜辞的常见格式',
    '对贞卜辞的常见格式（示意）',
    '《甲骨文合集》所收卜辞的常见格式',
    '《甲骨文合集》所收卜辞的常见格式',
    '占辞的常见写法',
  ],
};
