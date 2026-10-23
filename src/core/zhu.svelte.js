// 注疏：仪式里出现术语时，桌面右侧的注栏同步出一条注；点术语可以回看。手机上注栏折叠，点术语以浮注显示。
// 注是在说传统，用墨色宋体；与眉批（大师在说你）分开。注的数据在各卷自己的 zhu.json 里。

export const zhu = $state({
  notes: {}, // { 术语: { body, kind, cite } }
  shown: [], // 已经出过的注，最新的在前
  focus: '', // 被点回看的那一条
  pop: null, // 手机浮注：{ term, x, y, w }
});

const wide = () => matchMedia('(min-width: 960px)').matches;

/** 本卷的注 */
export function setNotes(notes) {
  zhu.notes = notes;
  zhu.shown = [];
  zhu.focus = '';
  zhu.pop = null;
}

let queue = [];
let timer = 0;
let held = false;

function drainQueue() {
  const t = queue.shift();
  if (t) zhu.shown = [t, ...zhu.shown];
  timer = queue.length ? setTimeout(drainQueue, 420) : 0;
}

/** 翻页时先不出注，落定后一起出 */
export function holdZhu(on) {
  held = on;
  if (!on && queue.length && !timer) drainQueue();
}

/** 换屏：清空这一屏已出的注（注写在各屏自己的左页边上） */
export function clearShown() {
  queue = [];
  clearTimeout(timer);
  timer = 0;
  zhu.shown = [];
  zhu.focus = '';
  zhu.pop = null;
}

/** 术语出现在眼前：桌面上注栏添一条。一次出现几个时，一条一条错开 */
export function reveal(term) {
  if (!wide() || !zhu.notes[term] || zhu.shown.includes(term) || queue.includes(term)) return;
  queue.push(term);
  if (timer || held) return;
  drainQueue();
}

/** 点术语：桌面上把这一条提到最前并提示；手机上弹出浮注 */
export function recall(term, anchor) {
  if (!zhu.notes[term]) return;
  if (wide()) {
    zhu.shown = [term, ...zhu.shown.filter((t) => t !== term)];
    zhu.focus = term;
    setTimeout(() => { if (zhu.focus === term) zhu.focus = ''; }, 1600);
    return;
  }
  const r = anchor.getBoundingClientRect();
  zhu.pop = { term, x: r.left + r.width / 2, y: r.bottom, top: r.top };
}

export function closePop() {
  zhu.pop = null;
}

export function resetZhu() {
  queue = [];
  clearTimeout(timer);
  timer = 0;
  zhu.shown = [];
  zhu.focus = '';
  zhu.pop = null;
}
