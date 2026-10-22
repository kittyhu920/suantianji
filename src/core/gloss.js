// 眉批槽：大师写在天头的批语（排版与逐字洇开的规则见 docs/DESIGN.md §4，必须保持）。
// 天头是一个固定大小的槽，同一时间只显示最新一条。
// 文字先整句排好版（每个字都已在 DOM 里，只是被动画延迟压着没出现），再逐字洇开：
// 写字的过程中不会因为一个个追加字而反复重排、折行、跳高度。
// 正文是淡墨；朱色只给句尾的"〇"、关键数字和警示句的着重点。

import { inkChar } from './inkchars.js';

const CLAUSE = /[^，。：；、！？]+[，。：；、！？]?|[，。：；、！？]/g;
const NUMBER = /\d+(?:\.\d+)?%?/g; // 关键数字：用朱点出

export function createGloss(host, { reduced = false } = {}) {
  const queue = [];
  let busy = false;
  let cur = null; // 正在显示的那一条

  // 等 ms 毫秒；被 wake() 叫醒就提前结束，并记下"被顶替了"
  const wait = (item, ms) => new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    item.wake = () => { item.woken = true; clearTimeout(t); resolve(); };
  });

  // key：同一类的批语只留最新一条。连点"功名、尘缘"时，排队的旧批语被剔掉，正在显示的马上让位给新的
  function push(text, { alarm = false, key = '' } = {}) {
    if (key) {
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1);
      if (cur?.key === key) cur.wake?.();
    }
    queue.push({ text, alarm, key });
    if (!busy) drain();
  }

  async function drain() {
    busy = true;
    while (queue.length) {
      const item = queue.shift();
      cur = item;
      const backlog = queue.length; // 后面还排着几条：写快些、停得短些
      const step = reduced ? 0 : backlog > 1 ? 12 : backlog ? 24 : 36;

      const old = [...host.children];
      old.forEach((n) => { n.classList.add('is-out'); setTimeout(() => n.remove(), 240); });
      const lead = old.length && !reduced ? 170 : 0; // 等旧的淡出再开始写

      const el = document.createElement('p');
      el.className = 'gloss' + (item.alarm ? ' is-alarm' : '');
      const box = document.createElement('span');
      box.className = 'gloss-t';
      const hot = new Set(); // 数字所在的字序
      for (const m of item.text.matchAll(NUMBER)) for (let k = 0; k < m[0].length; k++) hot.add(m.index + k);
      let n = 0;
      let pos = 0;
      // 按标点切成语段，每段是不可拆的一块：只在语段之间折行，不在"3.9 秒"或一个词中间断开
      for (const clause of item.text.match(CLAUSE) ?? []) {
        const word = document.createElement('span');
        word.className = 'ink-w';
        for (const ch of clause) {
          const c = inkChar(ch, lead + n++ * step);
          if (hot.has(pos)) c.classList.add('is-num');
          pos += ch.length;
          word.append(c);
        }
        box.append(word);
      }
      el.append(box);
      host.append(el);

      await wait(item, lead + n * step + 500); // 写完
      if (!item.woken) {
        el.classList.add('is-done');
        await wait(item, backlog ? 120 : 650); // 停一会儿，让人读完
      }
    }
    cur = null;
    busy = false;
  }

  function clear() {
    queue.length = 0;
    cur?.wake?.();
    host.replaceChildren();
  }

  return { push, clear };
}
