// 书的话折行（src/core/gloss-wrap.js）：不拆词、不拆数字、行首无标点、末行不只剩一两个字
import assert from 'node:assert/strict';
import { wrap, WORDS } from '../src/core/gloss-wrap.js';
import { allLedger } from '../src/core/ledger-lines.js';

const SAMPLES = [
  '我读出了你的犹豫，这一签你早就想好了。',
  '你停了八秒，我记为犹豫',
  '你摇了 3.2 秒，试了 2 次',
  '上签，我猜你 37% 会失望',
  '我有 62% 的把握猜中你',
  '这支签属火，我替你加过分',
  '第三杯，你犹豫了 1.8 秒',
  '阴杯，和我猜的不一样',
  '你选了第三处，想了 2.4 秒',
  '你按了 3.0 秒，手抖了 12 像素',
  '这道兆，我读作小吉',
  '第三次了，你还在求吉。我越来越懂你了……',
  '你不认，重求一签 ×2',
  '换成十进制，是 44',
  '我合上这一页，再翻开一页新的',
  '不信我，就按左下角那个“存疑”',
];

let bad = 0;
for (const cap of [4, 5, 6, 8]) {
  for (const s of SAMPLES) {
    const lines = wrap(s, cap);
    const flat = s.replace(/\s/g, '');
    assert.equal(lines.join('').replace(/\s/g, ''), flat, `丢字：${s}`);
    for (const l of lines.slice(1)) assert.ok(!/^[，。：；、！？”…]/u.test(l), `行首是标点：${l}（cap ${cap}）`);
    // 词与数字不被拆开
    for (const w of [...WORDS.filter((x) => x.length > 1), '3.2', '37%', '62%', '1.8', '2.4', '3.0', '12', '44']) {
      let from = 0;
      for (;;) {
        const at = flat.indexOf(w, from);
        if (at < 0) break;
        from = at + 1;
        // 词跨过了某一行的边界？
        let pos = 0;
        for (const l of lines.slice(0, -1)) {
          pos += l.replace(/\s/g, '').length;
          if (at < pos && at + w.length > pos) { console.log(`拆词：「${w}」在 ${lines.join(' / ')}（cap ${cap}）`); bad++; }
        }
      }
    }
    const last = [...lines[lines.length - 1]].filter((c) => !/[，。：；、！？”…]/u.test(c)).length;
    if (lines.length > 1 && last <= 2 && cap >= 5) { console.log(`末行太短：${lines.join(' / ')}（cap ${cap}）`); bad++; }
    if (cap === 5) console.log(lines.join(' / '));
  }
}
for (const t of allLedger()) { if ([...t].length > 14) { console.log(`记账太长：${t}`); bad++; } }
assert.equal(bad, 0);
console.log('gloss-wrap: ok');
