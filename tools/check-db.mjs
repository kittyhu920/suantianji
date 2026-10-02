// 校验签簿 public/data/fortune-db.json：签诗七言四句、六十甲子顺序、五行与吉凶配平、字段齐全。
// 用法：node tools/check-db.mjs（零依赖；CI 也跑它）

import { readFile } from 'node:fs/promises';

const db = JSON.parse(await readFile(new URL('../public/data/fortune-db.json', import.meta.url), 'utf8'));
const errors = [];
const fail = (msg) => errors.push(msg);
const chars = (s) => [...s];
const isHan = (c) => /\p{Script=Han}/u.test(c);

// 七言四句：每句正好 7 个汉字，不带标点
function checkVerse(label, lines) {
  if (!Array.isArray(lines) || lines.length !== 4) return fail(`${label}：应为四句，实为 ${lines?.length ?? 0} 句`);
  lines.forEach((l, i) => {
    const cs = chars(l);
    if (cs.length !== 7 || !cs.every(isHan)) fail(`${label} 第${i + 1}句"${l}"：应为 7 个汉字`);
  });
}
const need = (label, v) => { if (typeof v !== 'string' || !v.trim()) fail(`${label}：缺失或为空`); };

// 六十甲子
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const jiazi = Array.from({ length: 60 }, (_, i) => STEMS[i % 10] + BRANCHES[i % 12]);

const signs = db.signs ?? [];
const domains = Object.keys(db.domains ?? {});
const elements = Object.keys(db.elements ?? {});
const tones = db.levels ?? {};

if (signs.length !== 61) fail(`签应为 61 支（签头 + 六十甲子），实为 ${signs.length}`);
const names = new Set();
signs.forEach((s, i) => {
  const label = `第 ${s.no} 签"${s.name}"`;
  if (s.no !== i) fail(`${label}：签号应为 ${i}（按顺序排列）`);
  if (names.has(s.name)) fail(`${label}：签名重复`);
  names.add(s.name);
  checkVerse(label, s.poem);
  ['name', 'jie', 'bai', 'machine'].forEach((k) => need(`${label}.${k}`, s[k]));
  domains.forEach((d) => need(`${label}.advice.${d}`, s.advice?.[d]));
  if (!(s.level in tones)) fail(`${label}：等级"${s.level}"不在 levels 里`);
  if (s.no === 0) return; // 签头不属干支、不参与时辰加权
  if (s.gz !== jiazi[s.no - 1]) fail(`${label}：干支应为 ${jiazi[s.no - 1]}，实为 ${s.gz}`);
  need(`${label}.nayin`, s.nayin);
  if (!elements.includes(s.el)) fail(`${label}：五行"${s.el}"不在 elements 里`);
  else if (s.nayin && !s.nayin.endsWith(s.el)) fail(`${label}：五行应取纳音"${s.nayin}"的末字`);
});

// 配平：金木水火土各 12，吉平凶各 20（不含签头）
const count = (key) => signs.filter((s) => s.no > 0).reduce((m, s) => ((m[key(s)] = (m[key(s)] || 0) + 1), m), {});
const byEl = count((s) => s.el);
elements.forEach((e) => { if (byEl[e] !== 12) fail(`五行"${e}"应有 12 支，实为 ${byEl[e] ?? 0}`); });
const byTone = count((s) => tones[s.level]);
['ji', 'ping', 'xiong'].forEach((t) => { if (byTone[t] !== 20) fail(`吉凶"${t}"应有 20 支，实为 ${byTone[t] ?? 0}`); });

// 结局
const endings = db.endings ?? {};
['zun', 'ni', 'mi', 'po'].forEach((k) => {
  const e = endings[k];
  if (!e) return fail(`缺少结局 ${k}`);
  const label = `结局"${e.name}"`;
  checkVerse(label, e.verse);
  ['name', 'sub', 'critique', 'hint'].forEach((f) => need(`${label}.${f}`, e[f]));
  ['ji', 'ping', 'xiong'].forEach((t) => need(`${label}.lead.${t}`, e.lead?.[t]));
});

// 竖排会把全角竖线"｜"转成横线
const raw = JSON.stringify(db);
if (raw.includes('｜')) fail('签簿里出现了全角竖线"｜"，竖排后会变成横线');

if (errors.length) {
  console.error(`签簿校验未通过（${errors.length} 处）：\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`签簿校验通过：${signs.length} 支签、${Object.keys(endings).length} 种结局。`);
