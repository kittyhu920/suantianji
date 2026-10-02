# 演算天机

**你求签，我算你。**

一场被算法旁观的求签仪式：摇签、掷筊请示、解签。画面顶端一直有一位"大师"用朱笔写着眉批，记下你的每一次犹豫和重掷，猜你会不会失望。直到结局他才点破：在你求签的时候，他也在给你算命。

单局约两分钟，有四种结局，手机和电脑都能玩。在线体验：https://suantianji.pages.dev

## 玩法

1. 按朱印"问"入卷，选想问的方向（功名 / 尘缘 / 身心），可以写下具体的问题。
2. 摇签：手机直接晃，电脑按住签筒左右拖。
3. 掷筊请示：一平一凸是圣杯，两平是笑杯（再掷），两凸是阴杯（神明不同意）。连得三个圣杯，这支签才算数。
4. 观象：解签、结局、大师的坦白、行为账本，以及用你这一局的操作数据织成的命盘。

四种结局不看签的好坏，只看你怎么对待被给出的答案。可以试试：

- 留意天头的朱批，它从你打开页面起就在记录。
- 掷出阴杯时，偏要这支签。
- 一次次重求，直到求到第三支签。
- 犹豫的时候，看看画面左下角。

## 特点

- **零位图**：画面全部由 SVG、CSS 和 Canvas 绘制，声音全部由 Web Audio 实时合成。
- **零依赖、零构建**：原生 HTML / CSS / JavaScript（ES Modules），部署就是上传 `public/` 目录。
- **按真实习俗**：六十甲子签依甲子至癸亥排列，五行取纳音；掷筊规矩依闽台庙宇。
- **按真实物理**：签筒的倾角、竹签的弹跳、落签都由物理模拟驱动，手机上用加速度计。
- **隐私**：操作记录只存在你自己的设备上。只有勾选"通灵模式"时，你写下的问题才会发给云端 AI，且不保存。

## 本地运行

离线模式无需任何依赖：

```bash
node tools/serve.mjs
```

然后打开 http://localhost:8788 。直接双击 `public/index.html` 不行，浏览器不允许 `file://` 页面读取签诗数据。

连同通灵模式（Workers AI）一起调试：

```bash
npx wrangler pages dev public --ai AI
```

本地调用 Workers AI 也会走你的 Cloudflare 账户。

## 部署自己的一份

1. 建 D1 数据库并建表（通灵模式的按天限流计数）：

   ```bash
   npx wrangler d1 create suantianji
   npx wrangler d1 execute suantianji --remote --file migrations/0001_hits.sql
   ```

2. 把 `wrangler.toml` 里的 `database_id` 换成上一步输出的值。
3. 部署：

   ```bash
   npx wrangler pages deploy public --project-name <你的项目名> --branch main
   ```

不建数据库、不配 AI binding 也能玩，只是通灵模式不可用，结局页照常显示离线判词。限流阈值在 `functions/api/oracle.js` 顶部（默认每个 IP 每天 10 次、全站 200 次）。

## 目录

| 路径 | 内容 |
|---|---|
| `public/index.html` | 全部五屏的结构（入卷、定盘、摇签、掷筊、观象） |
| `public/css/style.css` | 宣纸朱批的视觉系统 |
| `public/js/main.js` | 流程与状态、眉批、结局判定、行为账本 |
| `public/js/profile.js` | 观人术：从玩家的行为推出眉批里的百分比与画像 |
| `public/js/qian.js` | 签筒的物理模拟与摇动控制 |
| `public/js/jiao.js` | 掷筊 |
| `public/js/loom.js` | 数纬命盘：由行为数据做种子织成 |
| `public/js/poster.js` | 结局分享图 |
| `public/js/ink.js` | 墨与水的画布动效 |
| `public/js/audio.js` | Web Audio 合成音效 |
| `public/js/rng.js` | 种子随机与真随机 |
| `public/data/fortune-db.json` | 六十一支签、三领域建议、四种结局判词 |
| `public/fonts/` | 按站内用字裁出的字体子集 |
| `functions/api/oracle.js` | 通灵模式的 Pages Function |
| `tools/subset-fonts.py` | 重新裁字体子集（改了中文文案后要跑） |
| `docs/DESIGN.md` | 设计规范 |

## 致谢

- 字体：[马善政楷书](https://github.com/googlefonts/mashanzheng)、[志莽行书](https://github.com/googlefonts/zhimangxing)、[刘建毛草](https://github.com/googlefonts/liujianmaocao)、[思源宋体](https://github.com/notofonts/noto-cjk)，均以 SIL Open Font License 1.1 发布。
- 设计原则部分借鉴 [InkView](https://github.com/qybaihe/inkview)（MIT）。
