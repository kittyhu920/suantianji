# 演算天机 · 给 Agent 的项目说明

一场被算法旁观的求签 Web 仪式（摇签 → 掷筊请示 → 解签）。线上：https://suantianji.pages.dev

- 设计规范：`docs/DESIGN.md`（古书 × 宣纸朱批 × 摇动控制；做任何美术改动前先读，逐项过它的检查清单）

## 结构

《演算天机》是一部收录多种民间算命法的书，一卷一卷地开：签（已开）、卦、卜、鸟、字、历（后五卷"未开卷"）。Astro + Svelte 5，纯静态输出到 `dist/`。

- `src/pages/`：路由。`index.astro` 卷首目录；`qian/` `gua/` `bu/` 各卷的 `index.astro` 只写一个 `<PageData kind="juan" juan="…">`；`*/yuanliu.md` 各卷源流；`about.astro`；`404.astro`。静态页都用 `core/BookFrame.astro`，各页只交一个 `<template id="stj-page">`（`core/PageData.astro`）。
- **整个站点只有一册常驻的书**：`Paper.astro` 用 Astro 的 `ClientRouter`，书（`core/Codex.svelte`）与字盘用 `transition:persist` 跨路由常驻，从目录进卷是书里翻页、不整页刷新；`data-theme` 在 `astro:before-swap` 里补回。各卷的 JS 与 CSS 要静态引入（`src/juan/modules.js`、`Paper.astro`），不要动态 import 样式。
- `src/core/`：公共层（页面外壳 `Paper.astro`、静态页的书 `BookFrame.astro`、常驻的书（天头栏 + 书 + 案 + 页脚）`Codex.svelte`、一卷的运行 `Ritual.svelte`（ctx 与一局，画当前这一屏到右页）、屏的对页登记 `Spread.svelte`、翻页 `book/`（`flip.js` 画翻动的纸，`book.svelte.js` 编排与写下的页，`gesture.js` 点页与拖页角，`motion.js` 书的动作）、结局分页 `end/EndPages.svelte`、书的话 `gloss.js`（大师的话写在书页的空白处）、`Seal.svelte`、`ink.js`、`audio.js`、`shake.svelte.js`、`profile.js`、`loom.js`、`poster.js`、`oracle.svelte.js`、注疏 `Zhu.svelte` / `ZhuPanel.svelte`（点术语贴一张小纸条）、`end/` 结局各部分、`styles/`（`book.css` 书的版式，`desk.css` 案与器物）、`paper/` 案上字盘 / 纸背透字 / 开卷，见 `docs/DESIGN.md` §13、§19）。
- `src/juan/index.js`：卷的注册表，文件头注释写明卷的接口（`id / name / title / open / steps / screens / zhu / enter(ctx) / atlas`；每一屏的右页只放写下的结果，再放一个 `<Spread>` 登记左页的名字、页脚的说明与按钮、案上的器物（`desk`，仪式在书外）；换屏就是翻一页，`ctx.show(name, { shut, reset })`，以及 `enter` 返回的 game：`attitude()` 返回遵逆破迷之一）。新增一卷：在这里加一行，再写自己的 `src/juan/<id>/`，在 `src/pages/<id>/` 挂页面。
- `src/juan/qian/`：签卷。`game.svelte.js` 是一局的流程与结局映射（`attitude()`：破 > 迷 > 逆 > 遵），`fortune-db.json` 是签簿，`zhu.json` 是注。
- `public/`：原样发布的静态资源（`fonts/`、`img/title-ink.svg`）。
- `functions/api/oracle.js`：通灵模式，Pages Function + Workers AI（GLM-4.7 Flash，已关闭思考模式）。用 D1 库 `suantianji`（绑定 `DB`）按天限流，建表见 `migrations/`。
- 页面加 `?debug` 可用 `window.__fx`（墨与水）、`window.__qian`（签筒）、`window.__zipan`（字盘）手动推进；`window.__book`（书：`flip`、`view`、`ctx`、`nav(dir)`、`bounce(dir)`），设 `window.__flipSlow = 10` 可把翻页放慢十倍。

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

- 视觉：古书 × 宣纸朱批（见 `docs/DESIGN.md`）。一册摊开的书，每走一步翻一页，**仪式在书外（器物摆在案上），书页只记结果；说明与按钮放页脚、不放页里；源流、关于、通灵开关在天头栏**；宣纸底、墨写正文、枯笔墨痕做骨架，没有朱丝栏、版框与方格；**朱只用于印章、朱批圈点（〇、关键数字、着重点）、阴杯、最终判词与关键操作按钮**；书的话、账本旁注、通灵的“实话”与注的正文都是墨（楷书或宋体），数字与句尾“〇”点朱，复用 `src/core/marks.js`，不要另写一套（筊杯按实物用红漆色）。不引入位图，美术靠 SVG、CSS 和 Canvas 生成。主按钮都是朱印。CSS 变量沿用旧名：`--gold` 现在是墨，`--gan` 是宣纸。
- 文案：签诗为七言四句，改完用 `node tools/check-db.mjs` 校验每句正好 7 字。
- 注疏：术语用 `<Zhu term="…">`，注写在各卷的 `zhu.json`，要有依据、不编造典故，原创设定标"原创"。注写在左页下方，用霞鹜文楷、墨色，不用朱。
- 字体自托管在 `public/fonts/`，是按站内用字（扫描 `src/` 下的 .astro/.svelte/.js/.css/.md/.json）裁出的子集。**改了任何中文文案后都要重跑** `python tools/subset-fonts.py`，否则新字会回落到系统字体。分工：标题类用汇文明朝体（`--f-display`），书的话与注用霞鹜文楷（`--f-kai`），正文、按钮、账本用思源宋体（`--f-text`）；字体族名只在 `src/core/styles/base.css` 一处改，来源在 `tools/subset-fonts.py`。
- **汇文明朝体的许可待确认**，正式上线前可能换成文津明朝（`@free-fonts/wenjin-mincho`，MIT AND OFL-1.1）或思源宋体；换的时候只改 `--f-display` 与 `subset-fonts.py` 里的 `DISPLAY`。
- 书在缩放过、向后倾了几度的场景里（`docs/DESIGN.md` §19）：页的尺寸用 `offsetWidth / offsetHeight`，屏幕坐标与书里的坐标互换用 `src/core/book/geo.js` 的 `bookMap`，**不要把 `getBoundingClientRect` 的结果直接当书里的 px**。翻页的纸每帧只直接写 `transform / opacity`，**不要写 CSS 变量**（性能预算见 §19）。
- 竖排文字不要用全角竖线"｜"，竖排后会转成横线。
- 测试中文接口请用 Node 的 fetch，不要用 Windows Git Bash 的 curl（后者发出的中文不是 UTF-8）。
- 选 Workers AI 模型时，要确认它对**免费计划**开放。
- 人称：整个作品是玩家和一位"掌握天机的大师"的对话。书的话、注的引导语和界面文案一律用第一人称"我"，不用第三人称的"机器、模型、系统"；"丑时"这类传统说法保留。书的话每条尽量不超过 20 字。
