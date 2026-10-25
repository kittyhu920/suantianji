// 注疏：按需显示。点一个术语，才在它旁边浮出一条注，像在书页上贴了一张小纸条；点别处或按 Esc 收起。
// 桌面与手机是同一种方式。注是在说传统，用墨色；注的数据在各卷自己的 zhu.json 里。
// 不再随流程自动出注，也没有常驻的注栏。键盘：Tab 聚焦到术语，Enter 或空格打开，Esc 关闭。

export const zhu = $state({
  notes: {}, // { 术语: { body, kind, cite } }
  pop: null, // 正在显示的纸条：{ term, el, x, y, top, left, right }（术语的元素与它的位置，视口坐标）
});

/** 本卷的注 */
export function setNotes(notes) {
  zhu.notes = notes;
  zhu.pop = null;
}

/** 点术语：在它旁边贴一条注；再点同一个术语收起 */
export function recall(term, anchor) {
  if (!zhu.notes[term]) return;
  if (zhu.pop?.term === term) { zhu.pop = null; return; }
  const r = anchor.getBoundingClientRect();
  zhu.pop = { term, el: anchor, x: r.left + r.width / 2, y: r.bottom, top: r.top, left: r.left, right: r.right };
}

export function closePop() {
  zhu.pop = null;
}

export function resetZhu() {
  zhu.pop = null;
}
