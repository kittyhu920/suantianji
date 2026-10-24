// 当前这一卷的会话：Ritual 在进入某一卷时挂上，Codex（页脚的存疑印、目录键、抗拒翻页时大师说话）从这里读。
// 不在某一卷里时，都是 null。

let juan = $state.raw(null); // 卷模块
let ctx = $state.raw(null); // 卷的运行环境（ctx.svelte.js）
let game = $state.raw(null); // 一局（enter 的返回值）；还没准备好时为 null
let ready = $state.raw(null); // Promise：game 已就绪、第一屏已渲染（换页翻纸要等它）

export const session = {
  get juan() { return juan; },
  set juan(v) { juan = v; },
  get ctx() { return ctx; },
  set ctx(v) { ctx = v; },
  get game() { return game; },
  set game(v) { game = v; },
  get ready() { return ready; },
  set ready(v) { ready = v; },
};
