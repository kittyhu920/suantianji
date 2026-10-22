// 卷的注册表。《演算天机》是一部收录多种民间算命法的书，每一种算法是一卷。
// 卷首目录（src/pages/index.astro）按这张表排版；新增一卷只需在这里加一行，再写自己的 src/juan/<id>/，
// 并在 src/pages/<id>/index.astro 挂页面（照 src/pages/qian/index.astro，包装组件照 src/juan/qian/Qian.svelte）。
//
// ── 一个新卷最少要实现什么 ──
// 卷模块（src/juan/<id>/index.js 的默认导出）：
//   id, name, title      卷 id（路由与本地存储命名空间用）、一字卷名、全称
//   open, start          是否开卷；第一屏的名字
//   screens              { 屏名: Svelte 组件 }。每一屏收到 { ctx, game }，根元素写 class="screen is-active"。
//                        必须有 start 指向的屏和 'end'（结局屏：用 core/end/* 拼，再加本卷自己的解读）
//   zhu                  注疏 { 术语: { body, kind: '古籍'|'民俗'|'原创', cite } }，可以是 {}
//   copy                 公共组件要显示的文案：oracleTitle / oracleAsk / oracleButton / oracleWait / oracleToggleDesc /
//                        oracleLimited { ip, global } / oracleFail / posterTitle / posterAlt / posterWait
//                        （不接通灵与分享图的卷可以省略）
//   enter(ctx)           开始一局，返回 game
//   Defs, atlas          可选：本卷的共享 SVG 图形；本卷的图谱数据
//
// game（enter 的返回值）必须有：
//   attitude()           本卷的映射，返回 'zun' 遵 | 'ni' 逆 | 'po' 破 | 'mi' 迷（src/core/ending.js）
//   ledgerData()         行为账本的原始数据（普通对象）；公共层用它定命盘的种子
//   onEnd({ endKey, seed, ledgerData, got, prev })   结局时把结果收进自己的状态，随后公共层换到 end 屏
//   toStart()            回到本卷入口（放弃这一局）
//   canDoubt()           现在是否可以“存疑”（四态里的“破”）；公共层据此显示存疑印、数发呆与离开页面
//   finish()             存疑印被按下、收尾动画之后，卷在这里走向结局（通常是 finishRound）
//   destroy()            离开页面时清理
// 可选：memory(endKey)（留给“大师记得你”的一条，返回 null 就不记）、busy()（正在操作，不算发呆）、
//   canOracle()（有没有东西可以请大师细说）、askOracle()、makePoster()（Promise<{blob,name}>）与 posterOpen。
//
// 结局收尾由公共层完成：在卷的 finish() 里调用 finishRound(ctx, game)（src/core/round.js）。
// ctx 提供什么见 src/core/ctx.svelte.js 的文件头。
//
// 公共层（src/core）：纸面 Paper.astro、仪式外壳 Ritual.svelte、眉批 gloss.js、印章 Seal.svelte、
// 墨与水 ink.js、声音 audio.js、摇动控制 shake.svelte.js、观人术（通用部分）profile.js、命盘框架 loom.js、
// 分享图框架 poster.js、通灵 oracle.svelte.js、注疏 Zhu.svelte / ZhuPanel.svelte、结局 round.js 与 end/*。
// 各卷特有的观人术、织法、分享图内容在各卷目录里（签卷：profile.js、loom-style.js、poster.js）。

export const juans = [
  {
    id: 'qian', name: '签', title: '六十甲子签', page: '一', open: true,
    intro: '摇一支签，掷三杯筊，问神明认不认。',
    href: '/qian/', source: '/qian/yuanliu/',
  },
  {
    id: 'gua', name: '卦', title: '金钱卦', page: '十七', open: true,
    intro: '三枚铜钱掷六回，画出一卦。',
    href: '/gua/', source: '/gua/yuanliu/',
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
