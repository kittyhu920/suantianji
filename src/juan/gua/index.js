// 卦卷：金钱卦（六爻）。卷的接口说明见 src/juan/index.js。

import Title from './Title.svelte';
import Ding from './Ding.svelte';
import Cast from './Cast.svelte';
import Jie from './Jie.svelte';
import End from './End.svelte';
import zhu from './zhu.json';
import db from './gua.json';
import { createGame } from './game.svelte.js';
import { atlas } from './atlas.js';

export default {
  id: 'gua',
  name: '卦',
  title: '金钱卦',
  open: true,
  start: 'title',
  // 本卷的屏。每一屏收到 { ctx, game }
  screens: { title: Title, ding: Ding, cast: Cast, jie: Jie, end: End },
  zhu, // 注疏
  // 字盘（案上的反刻活字）用字：《周易》六十四卦的卦辞原文，一卦一段（带标点，用字的一方自行取汉字）
  zipan: db.hexagrams.map((h) => h.ci),
  // 公共组件（分享图）要显示的文案；本卷不接通灵
  copy: {
    posterTitle: '保存这一卦',
    posterAlt: '这一卦的结果图',
    posterWait: '正在为你装裱……',
  },
  enter: (ctx) => createGame(ctx),
  atlas, // 卦谱：六十四卦的排法与已卜到过的卦（界面以后统一做）
};
