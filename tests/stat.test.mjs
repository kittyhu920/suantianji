// 匿名统计的最小测试：字段校验、问题归类、限流、令牌拒绝、聚合。不依赖网络和 wrangler，
// 用 node:sqlite 做一个够用的 D1 替身，直接调用 functions/api 里的处理函数。
//   node --no-warnings tests/stat.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { validateRound } from '../src/core/stat-schema.js';
import { classifyQuestion } from '../src/core/question-class.js';
import { buildRound } from '../src/core/stat.js';
import { pickLine, MIN_SAMPLE } from '../src/core/peer-lines.js';
import * as stat from '../functions/api/stat.js';
import * as admin from '../functions/api/stats-admin.js';

/* ───── D1 替身 ───── */
function makeDB() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_hits.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0002_stats.sql', import.meta.url), 'utf8'));
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    first: async (col) => { const r = sql.prepare(text).get(...args); return col ? r?.[col] : r; },
    run: async () => { sql.prepare(text).run(...args); return {}; },
    all: async () => ({ results: sql.prepare(text).all(...args) }),
  });
  return { sql, prepare: (t) => stmt(t), batch: (list) => Promise.all(list.map((s) => s.all())) };
}

const good = { juan: 'qian', domain: 'gong', ending: 'zun', result: '12', dur: '1-2', asked: true, qtone: 'hopeful', qtopic: 'work', theme: 'day' };
const post = (env, body, { ip = '1.2.3.4', type = 'application/json', raw } = {}) =>
  stat.onRequestPost({
    request: new Request('https://x.test/api/stat', { method: 'POST', headers: { 'content-type': type, 'cf-connecting-ip': ip }, body: raw ?? JSON.stringify(body) }),
    env,
  });
const get = (env, qs) => stat.onRequestGet({ request: new Request(`https://x.test/api/stat?${qs}`), env });
const adminGet = (env, token) =>
  admin.onRequestGet({ request: new Request('https://x.test/api/stats-admin', { headers: token ? { authorization: `Bearer ${token}` } : {} }), env });

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log(`  ok  ${name}`); };

/* ───── 字段校验 ───── */
await t('合法记录通过', () => assert.ok(validateRound(good).ok));
await t('未知字段、坏枚举、越界结果都拒绝', () => {
  for (const bad of [
    { ...good, question: '该不该辞职' }, { ...good, juan: 'niao' }, { ...good, ending: 'x' }, { ...good, domain: '功名' },
    { ...good, result: '61' }, { ...good, juan: 'gua', result: '0' }, { ...good, juan: 'bu', result: '12' }, { ...good, dur: '10' },
    { ...good, asked: 'yes' }, { ...good, qtopic: '工作' }, { ...good, asked: false }, { ...good, theme: 'x' }, null, [], 'x',
  ]) assert.equal(validateRound(bad).ok, false, JSON.stringify(bad));
});
await t('可选字段可以缺省', () => assert.ok(validateRound({ juan: 'bu', ending: 'po', dur: 'lt1', asked: false }).ok));

/* ───── 本地归类：原文不进上报 ───── */
await t('问题归类', () => {
  assert.deepEqual(classifyQuestion('我该不该辞职去创业'), { tone: 'hesitate', topic: 'work' });
  assert.equal(classifyQuestion('这次考试能过吗').topic, 'study');
  assert.equal(classifyQuestion('他喜欢我吗').topic, 'love');
  assert.equal(classifyQuestion('今天天气').topic, 'other');
  assert.deepEqual(classifyQuestion('  '), { tone: null, topic: null });
});
await t('buildRound 的结果里没有问题原文', () => {
  const q = '我该不该辞职去创业，爸妈都反对';
  const row = buildRound('qian', 'ni', { domain: 'gong', result: 7, question: q, asked: true, ms: 95000 });
  assert.equal(row.dur, '1-2');
  assert.equal(row.qtopic, 'work');
  assert.ok(!JSON.stringify(row).includes('辞职'));
  assert.equal(buildRound('bu', 'zun', { domain: null, result: 'ji', question: '自拟的命辞', asked: false, ms: 1000 }).qtopic, null);
});

/* ───── 接口 ───── */
const db = makeDB();
const env = { DB: db };

await t('POST 合法 → 204，落一行，且不含 IP', async () => {
  const res = await post(env, good);
  assert.equal(res.status, 204);
  const row = db.sql.prepare('SELECT * FROM rounds').get();
  assert.equal(row.juan, 'qian');
  assert.deepEqual(Object.keys(row).sort(), ['asked', 'day', 'domain', 'dur', 'ending', 'id', 'juan', 'qtone', 'qtopic', 'result', 'theme']);
  assert.ok(!JSON.stringify(db.sql.prepare('SELECT * FROM hits').all()).includes('1.2.3.4'));
});
await t('POST 非法 → 400；非 JSON → 415；过大 → 413；坏 JSON → 400', async () => {
  assert.equal((await post(env, { ...good, juan: 'zz' })).status, 400);
  assert.equal((await post(env, null, { type: 'text/plain', raw: JSON.stringify(good) })).status, 415);
  assert.equal((await post(env, null, { raw: JSON.stringify({ ...good, pad: 'x'.repeat(600) }) })).status, 413);
  assert.equal((await post(env, null, { raw: '{oops' })).status, 400);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM rounds').get().n, 1);
});
await t('单 IP 每天最多 60 局，超出静默丢弃（204）', async () => {
  for (let i = 0; i < 70; i++) assert.equal((await post(env, good, { ip: '9.9.9.9' })).status, 204);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM rounds').get().n, 1 + 60);
  assert.equal((await post(env, good, { ip: '8.8.8.8' })).status, 204); // 别的 IP 不受影响
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM rounds').get().n, 62);
});
await t('全站每天最多 5000 局', async () => {
  const day = new Date().toISOString().slice(0, 10);
  db.sql.prepare('UPDATE hits SET n = 5000 WHERE k = ?').run(`${day}:s*`);
  const before = db.sql.prepare('SELECT COUNT(*) n FROM rounds').get().n;
  assert.equal((await post(env, good, { ip: '7.7.7.7' })).status, 204);
  assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM rounds').get().n, before);
});
await t('GET 聚合与参数校验', async () => {
  const res = await get(env, 'juan=qian&days=1');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /max-age=300/);
  const j = await res.json();
  assert.equal(j.n, 62);
  assert.equal(j.domains.gong, 62);
  assert.equal(j.results['12'], 62);
  assert.equal(j.topics.work, 62);
  assert.equal((await get(env, 'juan=zz&days=1')).status, 400);
  assert.equal((await get(env, 'juan=qian&days=3')).status, 400);
  assert.equal((await (await get(env, 'juan=gua&days=7')).json()).n, 0);
});
await t('无 DB 绑定 → 503', async () => assert.equal((await post({}, good)).status, 503));

/* ───── 令牌 ───── */
await t('stats-admin：未设置 STATS_TOKEN 一律拒绝', async () => {
  assert.equal((await adminGet({ DB: db }, 'anything')).status, 401);
  assert.equal((await adminGet({ DB: db, STATS_TOKEN: '' }, '')).status, 401);
});
await t('stats-admin：错误或缺失的令牌拒绝，正确的放行', async () => {
  const tmp = `tmp-${Math.random().toString(36).slice(2)}`; // 只存在于这个进程里
  const e = { DB: db, STATS_TOKEN: tmp };
  assert.equal((await adminGet(e, null)).status, 401);
  assert.equal((await adminGet(e, 'wrong')).status, 401);
  assert.equal((await adminGet(e, `${tmp}x`)).status, 401);
  const ok = await adminGet(e, tmp);
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.equal(j.total, 62);
  assert.ok(Array.isArray(j.dims.ending) && j.byDay.length >= 1);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
});

/* ───── 对玩家说的话 ───── */
await t('样本不足不说数字；读不到聚合不说话', () => {
  const mine = { juan: 'qian', domain: 'gong', ending: 'zun', result: '12', qtopic: 'work', qtone: 'hopeful' };
  assert.ok(!/\d/.test(pickLine({ n: MIN_SAMPLE - 1 }, mine, '今天', 3)));
  assert.equal(pickLine(null, mine, '今天', 3), null);
  const agg = { n: 100, domains: { gong: 37 }, endings: { zun: 50 }, results: { 12: 3 }, topics: { work: 20 }, tones: { hopeful: 30 } };
  for (let s = 0; s < 8; s++) assert.match(pickLine(agg, mine, '今天', s), /\d|十个/);
});

console.log(`${passed} passed`);
