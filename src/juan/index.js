// 卷的注册表。《演算天机》是一部收录多种民间算命法的书，每一种算法是一卷。
// 卷首目录（src/pages/index.astro）按这张表排版；新增一卷只需在这里加一行，再写自己的 src/juan/<id>/。
//
// ── 卷的接口（src/juan/<id>/index.js 的默认导出）──
//   id, name, title      卷 id（路由与存储用）、一字卷名（签、卦、卜……）、全称（六十甲子签）
//   open                 是否开卷
//   start                第一屏的名字
//   screens              { 屏名: Svelte 组件 }。每一屏收到 { ctx, game }；屏根元素用 class="screen is-active"
//   Defs                 可选，本卷的共享 SVG 图形（如筊杯的红漆）
//   zhu                  注疏：{ 术语: { body, kind: '古籍'|'民俗'|'原创', cite } }
//   enter(ctx)           开始一局，返回 game（会话对象）。ctx 见 src/core/ctx.svelte.js：
//                        gloss / show / sfx / fx / ledger / profile / birth / store / zhu ……
//   atlas                本卷的图谱数据（签谱、卦谱、兆谱），可为 null
//
// ── game（enter 的返回值）──
//   attitude()           返回四态之一：'zun' 遵 | 'ni' 逆 | 'po' 破 | 'mi' 迷（src/core/ending.js），供公共的结局使用
//   toStart()            回到本卷入口（放弃这一局）
//   doubtVisible, doubt()      “存疑”印是否显示、被按下（四态里的“破”，各卷共用）
//   makePoster()         可选，返回 Promise<{ blob, name }>；有它，仪式页就带分享图对话框（game.posterOpen 控制开合）
//   destroy()            离开页面时清理
//
// 公共层（src/core）：纸面 Paper.astro、仪式外壳 Ritual.svelte、眉批 gloss.js、印章 Seal.svelte、
// 墨与水 ink.js、声音 audio.js、摇动控制 shake.svelte.js、观人术 profile.js、命盘 loom.js、分享图 poster.js、
// 通灵 oracle.svelte.js、注疏 Zhu.svelte / ZhuPanel.svelte、结局 end/*。

export const juans = [
  {
    id: 'qian', name: '签', title: '六十甲子签', page: '一', open: true,
    intro: '摇一支签，掷三杯筊，问神明认不认。',
    href: '/qian/', source: '/qian/yuanliu/',
    load: () => import('./qian/index.js'),
  },
  {
    id: 'gua', name: '卦', title: '金钱卦', page: '十七', open: false,
    intro: '三枚铜钱掷六回，画出一卦。',
  },
  {
    id: 'bu', name: '卜', title: '甲骨灼卜', page: '三十三', open: false,
    intro: '灼龟甲，看裂纹，王占曰吉凶。',
  },
  {
    id: 'niao', name: '鸟', title: '文鸟抽卡', page: '四十九', open: false,
    intro: '文鸟开笼，叼出一张签卡。',
  },
  {
    id: 'zi', name: '字', title: '测字', page: '六十五', open: false,
    intro: '写下一个字，拆开来读。',
  },
  {
    id: 'li', name: '历', title: '黄历', page: '八十一', open: false,
    intro: '一日一页，宜忌各有所据。',
  },
];
