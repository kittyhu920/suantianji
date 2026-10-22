// 签卷：六十甲子签。卷的接口说明见 src/juan/index.js。

import Title from './Title.svelte';
import Ding from './Ding.svelte';
import Shake from './Shake.svelte';
import Jiao from './Jiao.svelte';
import End from './End.svelte';
import JiaoDefs from './JiaoDefs.svelte';
import zhu from './zhu.json';
import { createGame } from './game.svelte.js';

export default {
  id: 'qian',
  name: '签',
  title: '六十甲子签',
  open: true,
  start: 'title',
  // 本卷的屏。每一屏收到 { ctx, game }
  screens: { title: Title, ding: Ding, qian: Shake, jiao: Jiao, end: End },
  Defs: JiaoDefs, // 本卷的共享图形（筊杯的红漆）
  zhu, // 注疏
  enter: (ctx) => createGame(ctx),
  atlas: null, // 签谱，之后的批次接入
};
