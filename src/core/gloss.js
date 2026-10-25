// 书的话：大师（这本书）开口时，封面掀起一个角度，字迹写在露出的扉页上（docs/DESIGN.md §4、§19）。
// 一句话先整句排好版（每个字都已在 DOM 里，只是被动画延迟压着没出现），再一笔一笔洇开；
// 写完停一会儿，再慢慢渗进纸里、淡去；这一句的字迹淡去后，下一句接着写；没有下一句了，封面落回。
// 队列、去重（key）、写快写慢的节奏沿用旧的眉批槽。
// 字全是墨（不点朱）：用 --f-voice 的行书；警示句的着重点也用墨。
// 减少动效：不逐字洇开、封面不掀，只淡入、淡出。

import { inkChar } from './inkchars.js';

const CLAUSE = /[^，。：；、！？]+[，。：；、！？]?|[，。：；、！？]/g;
const LIFT_MS = 520; // 封面掀起要的时间

/**
 * host：扉页上写字的容器（.voice）。onState(true|false)：书开始说话（封面掀起）/ 说完（封面落回）。
 * onSay(text)：书每说一句，就把那一句的原文交出去（读屏的朗读区用它：扉页上的字是一个个洇开的，读屏读不到）。
 */
export function createGloss(host, { reduced = false, onState, onSay } = {}) {
  const queue = [];
  let busy = false;
  let cur = null; // 正在写的那一条
  let open = false;

  // 等 ms 毫秒；被 wake() 叫醒就提前结束，并记下"被顶替了"
  const wait = (item, ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    item.wake = () => { item.woken = true; clearTimeout(t); resolve(); };
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // key：同一类的话只留最新一条。连点"功名、尘缘"时，排队的旧话被剔掉，正在显示的马上让位给新的
  function push(text, { alarm = false, key = '' } = {}) {
    if (key) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1);
      if (cur?.key === key) cur.wake?.();
    }
    queue.push({ text, alarm, key });
    if (!busy) drain();
  }

  function build(item, step) {
    const el = document.createElement('p');
    el.className = 'gloss' + (item.alarm ? ' is-alarm' : '') + (reduced ? ' is-plain' : '');
    const box = document.createElement('span');
    box.className = 'gloss-t';
    let n = 0;
    // 按标点切成语段，每段是不可拆的一块：只在语段之间折行，不在一个词中间断开
    for (const clause of item.text.match(CLAUSE) ?? []) {
      const word = document.createElement('span');
      word.className = 'ink-w';
      for (const ch of clause) word.append(inkChar(ch, reduced ? 0 : n++ * step));
      box.append(word);
    }
    el.append(box);
    return { el, n };
  }

  function setOpen(on) {
    if (on === open) return;
    open = on;
    onState?.(on);
  }

  async function drain() {
    busy = true;
    while (queue.length) {
      if (!open) {
        setOpen(true);
        if (!reduced) await sleep(LIFT_MS); // 等封面掀起来
        if (!queue.length) break;
      }
      const item = queue.shift();
      cur = item;
      const backlog = queue.length; // 后面还排着几条：写快些、停得短些
      const step = reduced ? 0 : backlog > 1 ? 14 : backlog ? 28 : 46;
      const { el, n } = build(item, step);
      host.replaceChildren(el); // 一次只写一句：扉页上只留这一句
      onSay?.(item.text);
      item.el = el;

      await wait(item, n * step + (reduced ? 420 : 560)); // 写完
      item.written = !item.woken;
      if (!item.woken) await wait(item, backlog ? 500 : Math.min(3600, 1500 + item.text.length * 85)); // 停一会儿，让人读完
      sink(el, item.woken || backlog > 2);
      if (queue.length) await sleep(item.woken || backlog > 2 ? 120 : 360); // 前一句渗进去一点，再写下一句
    }
    cur = null;
    await sleep(reduced ? 200 : 700); // 余韵：话刚说完，封面不立刻落下
    if (queue.length) { drain(); return; }
    busy = false;
    setOpen(false);
  }

  // 渗进纸里、淡去
  function sink(el, quick) {
    el.classList.add(quick ? 'is-out' : 'is-sink');
    setTimeout(() => el.remove(), quick ? 360 : 2000);
  }

  function clear() {
    queue.length = 0;
    cur?.wake?.();
    host.replaceChildren();
  }

  return { push, clear };
}
