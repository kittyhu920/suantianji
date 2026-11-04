# 演算天机

**你求签，我算你。**

《演算天机》是一部收录多种民间算命法的书，一卷一卷地开。首页是一张灯下的 3D 书桌：正中一本合上的线装书，四周摆着各卷的器物。目前开了三卷：签（摇签、掷筊请示）、卦（金钱卦）、卜（甲骨灼卜）；星、鸟、字、历四件器物压暗着，写着“未开卷”。

进卷后，仪式在桌上用器物完成，书翻开着摊在旁边：书开口时，用行书写在左页（扉页）上，全是墨；右页上，它一条条记下你这一局做了什么——摇了几次、每一杯是什么杯、按了几秒、手抖了多少。仪式一完，书滑到桌子中央、翻开，里面是它替你写的命书：签文、卦、兆、判词、坦白、账本、命盘、四种结局，用真的曲面卷页（WebGL）一页页翻着读。读完最后一页再往后翻，书会合上，在封面盖一方印。直到结局他才点破：在你求签的时候，他也在给你算命。

单局约两到三分钟，桌面为主，手机也能完整玩。在线体验：https://suantianji.pages.dev

<p align="center">
  <img src="docs/img/title.jpg" width="260" alt="早期版本的首页（截图待更新）">
  <img src="docs/img/jiao.jpg" width="260" alt="早期版本的掷筊请示（截图待更新）">
  <img src="docs/img/loom.jpg" width="260" alt="早期版本的命盘与四种结局（截图待更新）">
</p>

> 上面三张是早期版本的截图，现在的画面是书桌与线装书，截图待更新。

## 玩法

0. 在书桌上点一件器物进卷：签筒（签）、龟壳与铜钱（卦）、龟甲（卜）；写着“未开卷”的几件还没有开。
1. 点桌面正中朱红的“问”（卜卷是“卜”）字印开始，选一块木牌定下想问的方向（功名 / 尘缘 / 身心），可以在纸笺上写下具体的问题，再点“定”。
2. 各卷的仪式：
   - 签：按住签筒摇（手机可以直接晃），落出一支签；再掷筊请示——一平一凸是圣杯，两平是笑杯（再掷），两凸是阴杯（神明不同意）。连得三个圣杯，这支签才算数。
   - 卦：按住龟壳摇，三枚铜钱掷六回，爻自下而上画出来，得出本卦与变卦。
   - 卜：在龟腹甲背面的钻凿上按住，炭火渐红，裂出一道兆；读兆之后可以受兆、再灼一处，或者对贞——把同一件事反过来问一次。
3. 观象：书滑到中央、翻开成命书，翻着读结果、判词、大师的坦白、行为账本，以及用你这一局的操作数据织成的命盘；想带走，就保存成分享图。读完再往后翻一页，书合上，在封面对应的结局印位盖一方印。

四种结局不看结果的好坏，只看你怎么对待被给出的答案：遵（照单全收）、逆（天说不，你偏要）、破（不信这一套，按页脚的“存疑”）、迷（一直重来）。封面题签下面的四个印位就是这四种结局，在任何一卷得过，就盖上那一方。

## 特点

- **零位图**：画面全部由 SVG、CSS、Canvas 和 WebGL 现场生成（书桌、器物、书、活字都是程序几何与程序纹理），声音全部由 Web Audio 实时合成。
- **一张常驻的书桌**：Astro 的 ClientRouter 让书桌（three.js 场景）跨页面常驻，从书桌点器物进卷不整页刷新；昼夜两套灯光，背景是一盘可以点的 3D 铅字字盘。
- **真的翻页**：命书的每一页是 Canvas 画的纹理，翻页用 three.js 做曲面卷页（卷曲、光照与投影、背面透字、惯性与回弹），读命书时镜头正俯视。
- **退回与无障碍**：手机、减少动效、不支持 WebGL 时退回 2D 书桌与平面翻页，功能等价；书说的话、命书每一页都有读屏可读的文字版，要按住的器物可以用键盘（Tab 选中，按住空格）。
- **公共层 + 卷**：书桌、书（封面、命书、翻页、书的话与右页记账）、桌上的器物、印章、声音、摇动控制、观人术、命盘、四态结局、分享图、通灵都在 `src/core/`；每一卷只写自己的器物、数据、规矩和命书的页（`src/juan/<id>/`），在 `src/juan/index.js` 注册。
- **按真实习俗与典籍**：六十甲子签依甲子至癸亥排列，五行取纳音；掷筊规矩依闽台庙宇；卦辞依通行本《周易》；卜辞按甲骨卜辞的前辞、命辞、占辞格式。各卷有源流页，术语有注，原创的设定都标明“原创”。
- **隐私**：操作记录只存在你自己的设备上。每局结束会匿名上报一条统计（不含你写的问题原文，具体字段见关于页的“隐私”一节），用来在结局里说“和你一样的人”有多少。只有打开“通灵”时，你写下的问题才会发给云端 AI，且不保存。

## 本地运行

需要 Node 22.12 以上（`package.json` 的 `engines`）：

```bash
npm install
npm run dev        # http://localhost:8788
npm run build      # 构建到 dist/
npm run preview    # 预览构建结果
```

开发服务器不带 Functions，通灵模式不可用（页面照常显示离线判词）。连同通灵模式（Workers AI）一起调试：

```bash
npm run build && npx wrangler pages dev dist --ai AI
```

本地调用 Workers AI 也会走你的 Cloudflare 账户。

## 部署自己的一份

1. 建 D1 数据库并建表（通灵模式的按天限流计数、匿名统计）：

   ```bash
   npx wrangler d1 create suantianji
   npx wrangler d1 migrations apply suantianji --remote
   ```

2. 把 `wrangler.toml` 里的 `database_id` 换成上一步输出的值。
3. 部署：

   ```bash
   npm run build
   npx wrangler pages deploy dist --project-name <你的项目名> --branch main
   ```

不建数据库、不配 AI binding 也能玩，只是通灵模式与统计不可用，结局页照常显示离线判词。作者统计页（`/admin/`）需要设置环境变量 `STATS_TOKEN`，不设置则一律拒绝。限流阈值在 `functions/api/oracle.js` 顶部（默认每个 IP 每天 10 次、全站 200 次）。

## 目录

| 路径 | 内容 |
|---|---|
| `src/pages/` | 路由：`index.astro` 书桌、`qian/`、`gua/`、`bu/` 各卷仪式与源流、`about.astro`、`404.astro` |
| `src/core/` | 公共层：`Paper.astro` 页面外壳（ClientRouter，书桌常驻）、`Codex.svelte` 常驻的书桌（天头栏 + 桌子 + 页脚）、`BookFrame.astro` / `PageData.astro` 页面交给书桌的内容、`Ritual.svelte` 一卷的运行、`Spread.svelte` 每一屏的登记、`book/` 书（封面、命书的页与 WebGL 翻页、书的动作）、`desk/` 桌上的器物、`gloss.js` 书的话、`ledger-lines.js` 右页记账、`Seal.svelte` 印章、`audio.js` 声音、`shake.svelte.js` 摇动控制、`profile.js` 观人术、`loom.js` 命盘、`poster.js` 分享图、`oracle.svelte.js` 通灵、`scene/` 3D 书桌与字盘（`paper/` 是 2D 字盘）、`styles/` 样式 |
| `src/juan/index.js` | 卷的注册表与卷的接口说明（七卷的元数据：签、卦、卜已开，星、鸟、字、历 `open: false`） |
| `src/juan/qian/` | 签卷：`game.svelte.js` 一局的流程与结局映射、各屏的 Svelte 组件、`book.js` 命书的页、`tube.js` 签筒物理、`jiao.js` 掷筊、`zhu.json` 注、`fortune-db.json` 六十一支签与四种结局判词（`gua/`、`bu/` 同构） |
| `public/` | 原样发布的静态资源：`fonts/` 按站内用字裁出的字体子集 |
| `functions/api/` | Pages Functions：`oracle.js` 通灵模式，`stat.js` 匿名统计，`stats-admin.js` 作者统计页的接口 |
| `migrations/` | D1 建表：通灵限流计数、统计 |
| `tools/subset-fonts.py` | 重新裁字体子集（改了中文文案后要跑，依赖见 `requirements.txt`） |
| `tools/check-db.mjs` | 校验签簿：七言四句、六十甲子顺序、五行与吉凶配平（CI 也跑） |
| `docs/DESIGN.md` | 设计规范 |

## 许可

- 程序代码：[MIT](LICENSE)
- 文案（签诗、解签、判词、书的话与界面文字、通灵提示词）：[CC BY-NC-SA 4.0](LICENSE-CONTENT)，可以改编、转载，但须署名、不得商用，改编后以相同许可发布
- 字体：霞鹜文楷、龙藏体与思源宋体是 SIL Open Font License 1.1，见 [public/fonts/OFL.txt](public/fonts/OFL.txt)

## 致谢

- 字体：[霞鹜文楷](https://github.com/lxgw/LxgwWenKai)、[龙藏体](https://github.com/googlefonts/longcang)（书的字）、[思源宋体](https://github.com/notofonts/noto-cjk)，标题用汇文明朝体。
- 设计原则部分借鉴 [InkView](https://github.com/qybaihe/inkview)（MIT）。
