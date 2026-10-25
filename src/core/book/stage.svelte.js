// 书桌上的共享状态（docs/DESIGN.md §19）。
//
//   spread     当前这一屏登记的东西 { hint, foot, desk, book }（Spread.svelte 登记，Codex 读）
//   stage      书现在是不是在说话（封面掀起一个角度）；said / saidN 是书刚说的那一句与它的序号（读屏的朗读区用，见 Book.svelte）
//   bookEl     合着的书（2D 退回时是 DOM 元素，3D 时是 book3d 的句柄），书自己的动作（fx.js）作用在它上面

let cur = $state.raw(null);
export const spread = {
  get cur() { return cur; },
};

/** 屏登记自己这一步的信息；返回注销函数 */
export function registerSpread(entry) {
  cur = entry;
  return () => { if (cur === entry) cur = null; };
}

export const stage = $state({ speaking: false, said: '', saidN: 0 });

export const bookEl = { el: null, gl: null }; // gl：3D 书桌里的书（scene/book3d.js），有它时书自己的动作作用在它上面
