# 演算天机 · 给 Agent 的项目说明

一场被算法旁观的求签 Web 仪式（摇签 → 掷筊请示 → 解签）。线上：https://suantianji.pages.dev

- 设计规范：`docs/DESIGN.md`（宣纸朱批 × 摇动控制；做任何美术改动前先读，逐项过它的检查清单）

## 结构

- `public/`：唯一对外发布的静态目录。原生 ES Modules，无构建步骤。
- `functions/api/oracle.js`：通灵模式，Pages Function + Workers AI（GLM-4.7 Flash，已关闭思考模式）。用 D1 库 `suantianji`（绑定 `DB`）按天限流，建表见 `migrations/`。
- `public/js/ink.js`：墨与水的画布动效（水纹、墨渍、墨晕），约束见 `docs/DESIGN.md` §8。页面加 `?debug` 可用 `__fx` 手动推进。
- `public/img/title-ink.svg`：首页那一笔墨痕（单独成图，只光栅化一次，见 `docs/DESIGN.md` §8）。
- `tools/serve.mjs`：零依赖本地服务器，只提供离线模式。

## 命令

```bash
node tools/serve.mjs                                   # 本地预览 http://localhost:8788
npx wrangler pages dev public --ai AI                  # 连同 Function 调试（会计费）
npx wrangler pages deploy public --project-name suantianji --branch main --commit-dirty=true
```

## 约定

- 视觉：宣纸朱批（见 `docs/DESIGN.md`）。宣纸底、墨写正文、枯笔墨痕做骨架；**朱色只用于印章、朱批（眉批）和阴杯**（筊杯按实物用红漆色）。不引入位图，美术靠 SVG、CSS 和 Canvas 生成。主按钮都是朱印。CSS 变量沿用旧名：`--gold` 现在是墨，`--gan` 是宣纸。
- 文案：签诗为七言四句，改完用 Node 校验每句正好 7 字。
- 字体自托管在 `public/fonts/`，是按站内用字裁出的子集。**改了任何中文文案后都要重跑** `python tools/subset-fonts.py`，否则新字会回落到系统字体。
- 竖排文字不要用全角竖线"｜"，竖排后会转成横线。
- 测试中文接口请用 Node 的 fetch，不要用 Windows Git Bash 的 curl（后者发出的中文不是 UTF-8）。
- 选 Workers AI 模型时，要确认它对**免费计划**开放。
- 人称：整个作品是玩家和一位"掌握天机的大师"的对话。眉批和界面文案一律用第一人称"我"，不用第三人称的"机器、模型、系统"；"丑时"这类传统说法保留。眉批每条尽量不超过 20 字。
