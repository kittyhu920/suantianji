// 签卷：六十甲子签。卷的接口说明见 src/juan/index.js。

import Title from './Title.svelte';
import Ding from './Ding.svelte';
import Shake from './Shake.svelte';
import Jiao from './Jiao.svelte';
import End from './End.svelte';
import JiaoDefs from './JiaoDefs.svelte';
import zhu from './zhu.json';
import { createGame } from './game.svelte.js';
import db from './fortune-db.json';

export default {
  id: 'qian',
  name: '签',
  title: '六十甲子签',
  open: true,
  start: 'title',
  // 本卷的屏。每一屏收到 { ctx, game }
  screens: { title: Title, ding: Ding, qian: Shake, jiao: Jiao, end: End },
  // 页脚的步骤进度：k 是屏名
  steps: [{ k: 'ding', name: '择域' }, { k: 'qian', name: '摇签' }, { k: 'jiao', name: '掷筊' }, { k: 'end', name: '观象' }],
  Defs: JiaoDefs, // 本卷的共享图形（筊杯的红漆）
  zhu, // 注疏
  zipan: () => db.signs.map((s) => s.poem.join('')).join(''), // 案上字盘的用字：本卷六十一首签诗
  // 公共组件（通灵、分享图）要显示的文案
  copy: {
    oracleTitle: '通灵解签',
    oracleAsk: '还想听我用大白话细说？我会把你这支签、掷筊的结果，连同你写下的问题，送去云端请 AI 解一解。',
    oracleButton: '请大师细说',
    oracleWait: '大师正在细看你的签',
    oracleToggleDesc: '勾选后，由 AI 用大白话帮你解签、回答你写下的问题（需联网）',
    oracleLimited: {
      ip: '你今天已经找我细说过好几回了，明天再来吧。上面的解签，就是这次的结果。',
      global: '今天来找我细说的人太多了，明天再来吧。上面的解签，就是这次的结果。',
    },
    oracleFail: 'AI 暂时没有回应。上面的解签就是这次的结果。',
    posterTitle: '保存这一签',
    posterAlt: '这一签的结果图',
    posterWait: '正在为你装裱……',
  },
  enter: (ctx) => createGame(ctx),
  atlas: null, // 签谱，之后接入
};
