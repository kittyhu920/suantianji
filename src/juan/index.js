// 卷的注册表。《演算天机》是一部收录多种民间算命法的书，每一种算法是一卷，在书桌上是一件器物。
// 书桌（src/core/Codex.svelte）按这张表摆器物：新增一卷只需在这里加一行，再写自己的 src/juan/<id>/，
// 在 src/juan/modules.js 里加一行（静态引入），在 src/core/Codex.svelte 的 SPOTS 里给它的器物定位置、
// 在 src/core/desk/Instrument.svelte 里画它的器物，并在 src/pages/<id>/index.astro 挂页面
// （照 src/pages/qian/index.astro：只写一个 <PageData kind="juan" juan="<id>" />）。
// 卷的样式（.css）在 src/core/Paper.astro 里静态引入，不要在卷的模块里动态加载样式。
//
// ── 一个新卷最少要实现什么 ──
// 卷模块（src/juan/<id>/index.js 的默认导出）：
//   id, name, title      卷 id（路由与本地存储命名空间用）、一字卷名、全称
//   open, start          是否开卷；第一屏的名字
//   steps                页脚的步骤进度 [{ k: 屏名, name: 两字步骤名 }]，按先后排；入口屏不在其中
//   screens              { 屏名: Svelte 组件 }。每一屏收到 { ctx, game }。
//                        **仪式在桌上，书合着旁观，结果写进命书**：屏不画页面，只放一个 <Spread>（core/Spread.svelte），
//                        把 hint（页脚的说明）、foot（页脚的按钮）、desk（桌上的器物与要玩家动手的东西）交给 Codex 渲染。
//                        器物里要接指针或物理的元素，用 use: 动作去接（desk 由 Codex 渲染，不在屏的 onMount 里，别用 bind:this + onMount）。
//                        问题写在桌上的纸笺（.ask-sheet.paper）上；择域是三支木牌（.slips）；样式见 core/styles/desk.css。
//                        换屏：ctx.show(name, { shut, reset, onCommit })：shut 是“重来”（重求、重起、再灼），书的封面掀一下再落回，
//                        reset 同时回卷首、再来一局；onCommit 在换屏的那一刻同步执行（卷在这里重置自己的状态）。
//                        不换屏、只改状态：ctx.turn(commit, { shut })。
//                        必须有 start 指向的屏和 'end'。结局屏：<Spread book={() => 页的数组}>，仪式完了书就摊开，
//                        里面是命书，翻页读（core/book/Reader.svelte）。页用 core/book/pages.js 的 composeBook 按顺序拼：
//                        扉页 → 本卷的结果页 → 过程记录 → 判词 → 坦白 →（通灵）→ 账本 → 命盘 → 四种结局；
//                        本卷自己的页在 src/juan/<id>/book.js，用 core/book/paint.js 的笔法画（Canvas 2D，设计尺寸 600×840）。
//                        页脚的按钮用 core/book/ReadFoot.svelte（合上、再来一次、请大师细说、保存）。
//   zhu                  注疏 { 术语: { body, kind: '古籍'|'民俗'|'原创', cite } }，可以是 {}。命书每一页的 zhu 字段列出这一页用到的术语，
//                        页脚显示它们的注（脚注）
//   copy                 公共组件要显示的文案：oracleTitle / oracleAsk / oracleButton / oracleWait / oracleToggleDesc /
//                        oracleLimited { ip, global } / oracleFail / posterTitle / posterAlt / posterWait
//                        （不接通灵与分享图的卷可以省略）
//   enter(ctx)           开始一局，返回 game
//   Defs, atlas          可选：本卷的共享 SVG 图形；本卷的图谱数据
//   zipan                可选：案上字盘（桌子底下那盘反刻活字）用本卷什么字。
//                        字符串，或返回字符串（可以是 Promise）的函数，取自本卷的典籍原文：签＝签诗，卦＝《周易》经文，
//                        卜＝甲骨卜辞释文，字＝《说文》，历＝历书宜忌用语。不写就用《说文》部首（src/core/paper/shuowen-bushou.js）。
//                        字盘按页面路径的第一段找卷（/qian/ 找 src/juan/qian/index.js），所以卷页面要挂在 /<id>/ 下。
//                        只取 BMP 里的汉字（标点、空白、扩展 B 区以后的字会被忽略）；总共少于 40 个字就当没写。
//                        字盘用思源宋体，字要在站内字体子集里：本字段写在 src/ 下，重跑 tools/subset-fonts.py 就会收进去，
//                        思源宋体本身没有字形的生僻字请别用。例：zipan: () => db.signs.map((s) => s.poem.join('')).join('')
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
// 公共层（src/core）：页面外壳 Paper.astro、常驻的书桌 Codex.svelte、一卷的运行 Ritual.svelte、合着的书 book/Book.svelte、
// 命书与翻页 book/Reader.svelte（three-book.js、curl.js、pages.js、paint.js、flow.js）、桌上的器物 desk/Instrument.svelte、
// 书的话 gloss.js（ctx.gloss）、印章 Seal.svelte、声音 audio.js、摇动控制 shake.svelte.js、观人术（通用部分）profile.js、
// 命盘框架 loom.js、分享图框架 poster.js、通灵 oracle.svelte.js、结局 round.js。
// 各卷特有的观人术、织法、分享图内容、命书的页在各卷目录里（签卷：profile.js、loom-style.js、poster.js、book.js）。

export const juans = [
  {
    id: 'qian', name: '签', title: '六十甲子签', open: true,
    intro: '摇一支签，掷三杯筊，问神明认不认。',
    href: '/qian/', source: '/qian/yuanliu/',
  },
  {
    id: 'gua', name: '卦', title: '金钱卦', open: true,
    intro: '三枚铜钱掷六回，画出一卦。',
    href: '/gua/', source: '/gua/yuanliu/',
  },
  {
    id: 'bu', name: '卜', title: '甲骨灼卜', open: true,
    intro: '灼龟甲，看裂纹，王占曰吉凶。',
    href: '/bu/', source: '/bu/yuanliu/',
  },
  {
    id: 'xing', name: '星', title: '观星', open: false,
    intro: '仰望二十八宿，连星成宿。',
  },
  {
    id: 'niao', name: '鸟', title: '文鸟抽卡', open: false,
    intro: '文鸟开笼，叼出一张签卡。',
  },
  {
    id: 'zi', name: '字', title: '测字', open: false,
    intro: '写下一个字，拆开来读。',
  },
  {
    id: 'li', name: '历', title: '黄历', open: false,
    intro: '一日一页，宜忌各有所据。',
  },
];
