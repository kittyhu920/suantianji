# 演算天机 · 给 Agent 的项目说明

一场被算法旁观的求签 Web 仪式（摇签 → 掷筊请示 → 解签）。线上：https://suantianji.pages.dev

- 设计规范：`docs/DESIGN.md`（宣纸朱批 × 摇动控制；做任何美术改动前先读，逐项过它的检查清单）

## 结构

《演算天机》是一部收录多种民间算命法的书，一卷一卷地开：签（已开）、卦、卜、鸟、字、历（后五卷"未开卷"）。Astro + Svelte 5，纯静态输出到 `dist/`。

- `src/pages/`：路由。`index.astro` 卷首目录；`qian/index.astro` 签卷仪式；`qian/yuanliu.md` 签卷源流；`about.astro`；`404.astro`。
- `src/core/`：公共层（纸面 `Paper.astro`、仪式外壳 `Ritual.svelte`、眉批 `gloss.js`、`Seal.svelte`、`ink.js`、`audio.js`、`shake.svelte.js`、`profile.js`、`loom.js`、`poster.js`、`oracle.svelte.js`、注疏 `Zhu.svelte` / `ZhuPanel.svelte`、`end/` 结局各部分、`styles/`）。
- `src/juan/index.js`：卷的注册表，文件头注释写明卷的接口（`id / name / title / open / screens / zhu / enter(ctx) / atlas`，以及 `enter` 返回的 game：`attitude()` 返回遵逆破迷之一）。新增一卷：在这里加一行，再写自己的 `src/juan/<id>/`，在 `src/pages/<id>/` 挂页面。
- `src/juan/qian/`：签卷。`game.svelte.js` 是一局的流程与结局映射（`attitude()`：破 > 迷 > 逆 > 遵），`fortune-db.json` 是签簿，`zhu.json` 是注。
- `public/`：原样发布的静态资源（`fonts/`、`img/title-ink.svg`）。
- `functions/api/oracle.js`：通灵模式，Pages Function + Workers AI（GLM-4.7 Flash，已关闭思考模式）。用 D1 库 `suantianji`（绑定 `DB`）按天限流，建表见 `migrations/`。
- 页面加 `?debug` 可用 `window.__fx`（墨与水）、`window.__qian`（签筒）手动推进。

## 命令

```bash
npm run dev                                            # 本地预览 http://localhost:8788（不带 Functions）
npm run build                                          # 构建到 dist/
npm run preview                                        # 预览构建结果
node tools/check-db.mjs                                # 签簿校验
python tools/subset-fonts.py                           # 改了中文文案后重裁字体
npx wrangler pages dev dist --ai AI                    # 连同 Function 调试（会计费，先 build）
npx wrangler pages deploy dist --project-name suantianji --branch main --commit-dirty=true
```

## 约定

- 视觉：宣纸朱批（见 `docs/DESIGN.md`）。宣纸底、墨写正文、枯笔墨痕做骨架；**朱色只用于印章、朱批圈点（眉批句尾的"〇"、关键数字、警示句的着重点）和阴杯**；眉批与注的正文是墨（眉批淡墨马善政楷书，注是墨色宋体）（筊杯按实物用红漆色）。不引入位图，美术靠 SVG、CSS 和 Canvas 生成。主按钮都是朱印。CSS 变量沿用旧名：`--gold` 现在是墨，`--gan` 是宣纸。
- 文案：签诗为七言四句，改完用 `node tools/check-db.mjs` 校验每句正好 7 字。
- 注疏：术语用 `<Zhu term="…">`，注写在各卷的 `zhu.json`，要有依据、不编造典故，原创设定标"原创"。注用墨色宋体，不用朱。
- 字体自托管在 `public/fonts/`，是按站内用字（扫描 `src/` 下的 .astro/.svelte/.js/.css/.md/.json）裁出的子集。**改了任何中文文案后都要重跑** `python tools/subset-fonts.py`，否则新字会回落到系统字体。
- 竖排文字不要用全角竖线"｜"，竖排后会转成横线。
- 测试中文接口请用 Node 的 fetch，不要用 Windows Git Bash 的 curl（后者发出的中文不是 UTF-8）。
- 选 Workers AI 模型时，要确认它对**免费计划**开放。
- 人称：整个作品是玩家和一位"掌握天机的大师"的对话。眉批、注栏的引导语和界面文案一律用第一人称"我"，不用第三人称的"机器、模型、系统"；"丑时"这类传统说法保留。眉批每条尽量不超过 20 字。
