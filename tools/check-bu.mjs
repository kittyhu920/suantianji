// 校验卜卷：结局诗七言四句、占辞齐全、兆纹生成可复现，兆象五类都能出现。
// 用法：node tools/check-bu.mjs（零依赖）

import { ENDINGS, ZHAN, DOMAINS } from '../src/juan/bu/data.js';
import { makeCrack, crackSignature } from '../src/juan/bu/crack.js';
import { OMEN_KEYS } from '../src/juan/bu/omen.js';

const errors = [];
const fail = (m) => errors.push(m);
const isHan = (c) => /\p{Script=Han}/u.test(c);

for (const k of ['zun', 'ni', 'mi', 'po']) {
  const e = ENDINGS[k];
  if (!e) { fail(`缺少结局 ${k}`); continue; }
  if (e.verse.length !== 4) fail(`结局"${e.name}"应为四句`);
  e.verse.forEach((l, i) => { const cs = [...l]; if (cs.length !== 7 || !cs.every(isHan)) fail(`结局"${e.name}"第${i + 1}句"${l}"：应为 7 个汉字`); });
  ['name', 'sub', 'critique', 'hint'].forEach((f) => { if (!e[f]) fail(`结局"${e.name}"缺 ${f}`); });
  ['ji', 'ping', 'xiong'].forEach((t) => { if (!e.lead?.[t]) fail(`结局"${e.name}"缺 lead.${t}`); });
}
for (const k of OMEN_KEYS) if (!ZHAN[k] || ZHAN[k].length !== 2) fail(`占辞缺 ${k}`);
if (JSON.stringify(ENDINGS).includes('｜')) fail('出现了全角竖线“｜”');
if (Object.keys(DOMAINS).length !== 3) fail('方向应为三个');

// 同一个种子必得同一道兆；随机取样，五类兆象都要出现
const seen = new Set();
for (let s = 1; s <= 4000; s++) {
  const a = makeCrack(s, 0.3), b = makeCrack(s, 0.3);
  if (crackSignature(a) !== crackSignature(b) || a.omen !== b.omen) { fail(`种子 ${s} 两次生成不一致`); break; }
  seen.add(a.omen);
}
for (const k of OMEN_KEYS) if (!seen.has(k)) fail(`4000 个种子里没出现兆象 ${k}`);

if (errors.length) { console.error(`卜卷校验未通过（${errors.length} 处）：\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`卜卷校验通过：四种结局、${OMEN_KEYS.length} 类兆象、兆纹可复现。`);
