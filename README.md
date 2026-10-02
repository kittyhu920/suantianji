# 演算天机

一场被算法旁观的求签问卦仪式。单局约 2 分钟，有四种结局。


## 本地运行

离线模式（默认），无需任何依赖：

```bash
node tools/serve.mjs
```

然后打开 http://localhost:8788 。
直接双击 `public/index.html` 不行，因为浏览器不允许 `file://` 页面读取签诗数据。

对外发布的只有 `public/` 和 `functions/`；`docs/`、`log/` 不会上线。

如果要连通灵模式（Workers AI）一起调试：

```bash
npx wrangler pages dev public --ai AI
```

注意：本地调用 Workers AI 也会走你的 Cloudflare 账户，并按量计费。

## 部署到 Cloudflare Pages

```bash
npx wrangler pages deploy public --project-name suantianji --branch main
```

`wrangler.toml` 里已经声明了 AI binding。没有这个 binding 时，通灵模式会自动回落到离线判词。

## 目录

| 路径 | 内容 |
|---|---|
| `public/index.html` | 全部五屏的结构（入卷、定盘、摇签、掷钱、观象） |
| `public/css/style.css` | 立轴 × 绀纸金泥视觉系统 |
| `public/js/main.js` | 状态机、机器旁批、结局判定、行为账本 |
| `public/js/iching.js` | 火珠林三钱法、六十四卦名 |
| `public/js/loom.js` | “数纬”：由行为数据做种子织成的终局命盘 |
| `public/js/audio.js` | WebAudio 合成音效（竹签、青铜、环境声） |
| `public/js/rng.js` | 种子随机与真随机 |
| `public/data/fortune-db.json` | 签诗、解曰、三领域分述、四结局判词 |
| `functions/api/oracle.js` | 通灵模式的 Pages Function |

## 可以试试

- 看画心右缘的竖排小字。它从你打开页面起就在记录。
- 在任何一步停下不动超过八秒。
- 对掷出的爻不满意，就再掷——但别掷太多次。
