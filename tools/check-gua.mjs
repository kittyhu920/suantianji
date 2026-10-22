// 校验卦簿 src/juan/gua/gua.json：六十四卦齐全且按通行本卦序、二进制互不重复并与上下卦一致、字段完整、
// 卦辞里不混入爻辞、结局诗七言四句、眉批不超过 20 字。
// 用法：node tools/check-gua.mjs（零依赖；CI 也跑它）

import { readFile } from 'node:fs/promises';
import { allGlosses } from '../src/juan/gua/words.js';

const db = JSON.parse(await readFile(new URL('../src/juan/gua/gua.json', import.meta.url), 'utf8'));
const errors = [];
const fail = (msg) => errors.push(msg);
const chars = (s) => [...s];
const isHan = (c) => /\p{Script=Han}/u.test(c);
const need = (label, v) => { if (typeof v !== 'string' || !v.trim()) fail(`${label}：缺失或为空`); };

// 通行本《周易》的卦序（独立写一遍，用来核对 gua.json 的顺序）
const KING_WEN = ('乾 坤 屯 蒙 需 讼 师 比 小畜 履 泰 否 同人 大有 谦 豫 随 蛊 临 观 噬嗑 贲 剥 复 无妄 大畜 颐 大过 坎 离 '
  + '咸 恒 遁 大壮 晋 明夷 家人 睽 蹇 解 损 益 夬 姤 萃 升 困 井 革 鼎 震 艮 渐 归妹 丰 旅 巽 兑 涣 节 中孚 小过 既济 未济').split(' ');

const TRIGRAMS = { 乾: '111', 兑: '110', 离: '101', 震: '100', 巽: '011', 坎: '010', 艮: '001', 坤: '000' };

// 八卦表
const tri = db.trigrams ?? {};
Object.entries(TRIGRAMS).forEach(([n, b]) => { if (tri[n]?.bin !== b) fail(`八卦“${n}”的二进制应为 ${b}，实为 ${tri[n]?.bin}`); });

const hs = db.hexagrams ?? [];
if (hs.length !== 64) fail(`应有 64 卦，实有 ${hs.length}`);
if (KING_WEN.length !== 64) fail(`校验脚本自己的卦序表不是 64 项（${KING_WEN.length}）`);

const names = new Set();
const bins = new Set();
const domains = Object.keys(db.domains ?? {});
hs.forEach((h, i) => {
  const label = `第 ${h.no} 卦“${h.name}”`;
  if (h.no !== i + 1) fail(`${label}：卦序号应为 ${i + 1}`);
  if (h.name !== KING_WEN[i]) fail(`${label}：通行本第 ${i + 1} 卦应为“${KING_WEN[i]}”`);
  if (names.has(h.name)) fail(`${label}：卦名重复`);
  names.add(h.name);

  if (!/^[01]{6}$/.test(h.bin ?? '')) fail(`${label}：bin 应为 6 位 0/1，实为“${h.bin}”`);
  else {
    if (bins.has(h.bin)) fail(`${label}：二进制 ${h.bin} 重复`);
    bins.add(h.bin);
    const want = (TRIGRAMS[h.lower] ?? '???') + (TRIGRAMS[h.upper] ?? '???');
    if (h.bin !== want) fail(`${label}：${h.lower}下${h.upper}上应为 ${want}，实为 ${h.bin}`);
  }
  if (!(h.lower in TRIGRAMS) || !(h.upper in TRIGRAMS)) fail(`${label}：上下卦“${h.upper}”“${h.lower}”不是八卦`);

  ['ci', 'bai', 'machine'].forEach((k) => need(`${label}.${k}`, h[k]));
  domains.forEach((d) => need(`${label}.advice.${d}`, h.advice?.[d]));
  if (h.ci && !chars(h.ci).some(isHan)) fail(`${label}：卦辞里没有汉字`);
  // 只收卦辞，不收爻辞：爻辞以"初九""六二""上六""用九"这样的爻题开头
  if (/(初|上)[六九]|[六九][二三四五]|用[六九]/.test(h.ci ?? '')) fail(`${label}：卦辞里出现了爻题，疑似混入爻辞`);
});

// 乾坤各占一端：乾全阳、坤全阴；先天序的两端
if (hs[0]?.bin !== '111111') fail('乾应为 111111');
if (hs[1]?.bin !== '000000') fail('坤应为 000000');

// 结局
const endings = db.endings ?? {};
function checkVerse(label, lines) {
  if (!Array.isArray(lines) || lines.length !== 4) return fail(`${label}：应为四句，实为 ${lines?.length ?? 0} 句`);
  lines.forEach((l, i) => {
    const cs = chars(l);
    if (cs.length !== 7 || !cs.every(isHan)) fail(`${label} 第${i + 1}句"${l}"：应为 7 个汉字`);
  });
}
['zun', 'ni', 'mi', 'po'].forEach((k) => {
  const e = endings[k];
  if (!e) return fail(`缺少结局 ${k}`);
  const label = `结局"${e.name}"`;
  checkVerse(label, e.verse);
  ['name', 'sub', 'lead', 'critique', 'hint'].forEach((f) => need(`${label}.${f}`, e[f]));
});

// 眉批：每条不超过 20 字
for (const [k, text] of allGlosses()) {
  const n = chars(text).length;
  if (n > 20) fail(`眉批 ${k}“${text}”有 ${n} 字，超过 20 字`);
}

// 竖排会把全角竖线"｜"转成横线
if (JSON.stringify(db).includes('｜')) fail('卦簿里出现了全角竖线"｜"，竖排后会变成横线');

if (errors.length) {
  console.error(`卦簿校验未通过（${errors.length} 处）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`卦簿校验通过：${hs.length} 卦、${Object.keys(endings).length} 种结局、${allGlosses().length} 条眉批样例。`);
