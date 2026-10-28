# 演算天机 · 给 Agent 的项目说明

一场被算法旁观的求签 Web 仪式（摇签 → 掷筊请示 → 解签）。线上：https://suantianji.pages.dev

- 设计规范：`docs/DESIGN.md`（古书 × 宣纸朱批 × 摇动控制；做任何美术改动前先读，逐项过它的检查清单）

## 结构

《演算天机》是一部收录多种民间算命法的书，一卷一卷地开：签、卦、卜（已开）和星、鸟、字、历（暗着摆在书桌上，“未开卷”）。首页是一张书桌，桌上的器物就是各卷。Astro + Svelte 5，纯静态输出到 `dist/`。

- `src/pages/`：路由。`index.astro` 书桌（首页）；`qian/` `gua/` `bu/` 各卷的 `index.astro` 只写一个 `<PageData kind="juan" juan="…">`；`*/yuanliu.md` 各卷源流；`about.astro`；`404.astro`。静态页用 `core/BookFrame.astro`（摊在桌上的一张纸），各页只交一个 `<template id="stj-page">`（`core/PageData.astro`）。
- **整个站点只有一张常驻的书桌**：`Paper.astro` 用 Astro 的 `ClientRouter`，书桌（`core/Codex.svelte`）与字盘用 `transition:persist` 跨路由常驻，从书桌点器物进卷不整页刷新；`data-theme` 在 `astro:before-swap` 里补回。各卷的 JS 与 CSS 要静态引入（`src/juan/modules.js`、`Paper.astro`），不要动态 import 样式。书桌有四个阶段（`.shell[data-phase]`）：`home` 书桌、`ritual` 仪式（书合着退到里侧，说话时封面掀起）、`reading` 命书（书滑到中央、翻开，WebGL 曲面翻页，右装）、`doc` 讲解页。
- `src/core/`：公共层。页面外壳 `Paper.astro`；常驻的书桌 `Codex.svelte`（天头栏 + 桌子 + 页脚）；一卷的运行 `Ritual.svelte`；`Spread.svelte` 每一屏登记桌上的器物 / 页脚说明与按钮 / 命书；`book/`（`Book.svelte` 合着的书与封面、`Reader.svelte` 读命书、`three-book.js` + `curl.js` WebGL 曲面卷页、`pages.js` + `paint.js` + `flow.js` 命书的页、`fx.js` 书的动作、`ReadFoot.svelte` 读命书时的页脚按钮、`notes.js` 脚注）；`desk/Instrument.svelte` 桌上的器物；`gloss.js` 书的话（封面掀起，写在扉页上）；`Seal.svelte`、`ink.js`（只剩字盘用）、`audio.js`、`shake.svelte.js`、`profile.js`、`loom.js`、`poster.js`、`oracle.svelte.js`、`end/PosterDialog.svelte`、`styles/`（`stage.css` 书桌与外壳、`book.css` 合着的书、`desk.css` 桌上的东西）、`paper/` + `scene/` 案上字盘，见 `docs/DESIGN.md` §13、§18、§19。
- `src/juan/index.js`：卷的注册表，文件头注释写明卷的接口（`id / name / title / open / steps / screens / zhu / enter(ctx) / atlas`；每一屏不画页面，只放一个 `<Spread>` 登记桌上的器物（`desk`，仪式在桌上）、页脚的说明与按钮；结局屏登记命书 `book={() => 页的数组}`；换屏 `ctx.show(name, { shut, reset })`；`enter` 返回的 game：`attitude()` 返回遵逆破迷之一）。新增一卷：在这里加一行，再写自己的 `src/juan/<id>/`（含命书的页 `book.js`），在 `src/pages/<id>/` 挂页面，在 `Codex.svelte` 的 `SPOTS` 与 `desk/Instrument.svelte` 里给它的器物定位置、画出来。星卷（`xing`）已在注册表里，`open: false`。
- `src/juan/qian/`：签卷。`game.svelte.js` 是一局的流程与结局映射（`attitude()`：破 > 迷 > 逆 > 遵），`fortune-db.json` 是签簿，`zhu.json` 是注。
- `public/`：原样发布的静态资源（`fonts/`）。
- `functions/api/oracle.js`：通灵模式，Pages Function + Workers AI（GLM-4.7 Flash，已关闭思考模式）。用 D1 库 `suantianji`（绑定 `DB`）按天限流，建表见 `migrations/`。
- 页面加 `?debug` 可用 `window.__qian`（签筒）、`window.__shell`（龟壳）、`window.__zipan`（字盘）手动推进，`window.__ctx.gloss('…')` 让书说话，`window.__reader`（命书的 WebGL 引擎与模式），`window.__desk.overlaps()`（3D 书桌的穿模检查：互相穿插、低于桌面、越出桌沿，见 §19“穿模检查”；动了桌上的位置或动画后在各个时刻扫一遍）。
- `functions/api/stat.js`：匿名统计。`POST` 每局结束记一行（`rounds` 表，字段枚举见 `src/core/stat-schema.js`），`GET ?juan=&days=1|7` 返回聚合（缓存 5 分钟）。单个 IP 哈希每天 60 局、全站每天 5000 局，超限静默丢弃（204），计数复用 `hits` 表。前端在 `src/core/stat.js`（上报）、`peer.svelte.js` / `peer-lines.js`（结局坦白里"和你一样的人"那句，模板集中在 `peer-lines.js`）；问题在浏览器本地归类（词表只在 `src/core/question-class.js`），原文不上报。各卷 `game.statData()` 交出结果标识。隐私说明（账本、关于页）要与上报字段保持一致，见 `docs/DESIGN.md` §16。
- `functions/api/stats-admin.js` 与 `src/pages/admin/`：只给作者看的统计页，令牌放 `Authorization: Bearer`，与环境变量 `STATS_TOKEN` 常量时间比较，没设置就一律拒绝。页面 noindex，不在任何地方链接。

## 更新日志

有玩家可见变化的改动，顺手记进根目录 `CHANGELOG.md` 的 `## [Unreleased]`（Keep a Changelog 1.1.0，中文，写给玩家看，不照搬 commit）。

## 命令

```bash
npm run dev                                            # 本地预览 http://localhost:8788（不带 Functions）
npm run build                                          # 构建到 dist/
npm run preview                                        # 预览构建结果
node tools/check-db.mjs                                # 签簿校验
python tools/subset-fonts.py                           # 改了中文文案后重裁字体
npx wrangler pages dev dist --ai AI                    # 连同 Function 调试（会计费，先 build）
npm run test:stat                                      # 统计接口测试（校验、限流、令牌；用 node:sqlite 做 D1 替身，已在 npm run check 里）
npx wrangler d1 migrations apply suantianji --local    # 本地 D1 建表（连同 Function 调试前先做）
npx wrangler d1 migrations apply suantianji --remote   # 线上建表：新增迁移后执行一次
npx wrangler pages secret put STATS_TOKEN --project-name suantianji   # 设置作者统计页令牌（自己定一个长随机串，不要写进仓库）
npx wrangler pages deploy dist --project-name suantianji --branch main --commit-dirty=true
```

## 约定

- 视觉：书桌 × 宣纸朱批（见 `docs/DESIGN.md`）。一张书桌，居中偏里一本合上的竖长线装书（3D 里是传统右装：书脊在右，封面向右翻开，读时从右往左翻页，←往后翻；整本书是镜像摆的，见 §19“书的形与装订”），书前与两侧是各卷的器物；**仪式在桌上，书合着旁观，结果写进命书；说明与按钮放页脚；源流、关于、通灵开关在天头栏**；宣纸底、墨写正文，没有朱丝栏、版框与方格；**朱只用于印章、变爻的圈点、阴杯、最终判词与关键操作按钮**；**书的话（行书）、账本旁注、坦白、通灵的“实话”与注的正文都是墨**，没有句尾的“〇”和朱色数字（筊杯按实物用红漆色）。不引入位图，美术靠 SVG、CSS、Canvas 和 WebGL 生成。主按钮都是朱印。CSS 变量沿用旧名：`--gold` 现在是墨，`--gan` 是宣纸。
- 文案：签诗为七言四句，改完用 `node tools/check-db.mjs` 校验每句正好 7 字。
- 注疏：注写在各卷的 `zhu.json`，命书每一页的 `zhu` 字段列出用到的术语，页脚显示脚注；要有依据、不编造典故，原创设定标"原创"。注用墨色，不用朱。
- 字体自托管在 `public/fonts/`，是按站内用字（扫描 `src/` 下的 .astro/.svelte/.js/.css/.md/.json）裁出的子集。书的字（`--f-voice`）是龙藏体（开源行书，OFL），要换字体看 `tools/subset-fonts.py` 的 `VOICE`。**改了任何中文文案后都要重跑** `python tools/subset-fonts.py`，否则新字会回落到系统字体。分工：标题类用汇文明朝体（`--f-display`），书的话与注用霞鹜文楷（`--f-kai`），正文、按钮、账本用思源宋体（`--f-text`）；字体族名只在 `src/core/styles/base.css` 一处改，来源在 `tools/subset-fonts.py`。
- **汇文明朝体的许可待确认**，正式上线前可能换成文津明朝（`@free-fonts/wenjin-mincho`，MIT AND OFL-1.1）或思源宋体；换的时候只改 `--f-display` 与 `subset-fonts.py` 里的 `DISPLAY`。
- 命书的页是 Canvas 画的纹理（设计尺寸 600×840）：字体要等加载完再画，**翻页时不重画纹理**，每帧只改正在翻的那张纸的顶点与法线；不要把每帧变化的值写成 CSS 变量（性能预算见 `docs/DESIGN.md` §19）。`loom.js` 的 `weave()` 不要一段一笔地描边（§19 “保存卡死的根因”）。合着的书在 CSS 3D 里：`.bk-body` 的祖先上不要放 `filter`、`overflow: hidden`、`mask`（会压平 `preserve-3d`）。
- 竖排文字不要用全角竖线"｜"，竖排后会转成横线。
- 测试中文接口请用 Node 的 fetch，不要用 Windows Git Bash 的 curl（后者发出的中文不是 UTF-8）。
- 选 Workers AI 模型时，要确认它对**免费计划**开放。
- 人称：整个作品是玩家和一位"掌握天机的大师"的对话。书的话、注的引导语和界面文案一律用第一人称"我"，不用第三人称的"机器、模型、系统"；"丑时"这类传统说法保留。书的话每条尽量不超过 20 字。
