// 匿名统计：每局结束记一行（POST），再按卷给前端一份聚合（GET），结局页大师据此说一句"和你一样的人"。
// 字段与枚举见 src/core/stat-schema.js；建表见 migrations/0002_stats.sql。
//
// 隐私：不读也不存 IP 原文、UA、cookie。IP 只在内存里哈希后当作限流计数的键（写进 hits，不写进 rounds）。
// 超限静默丢弃，返回 204：玩家不会因此看到任何错误，也不知道自己被限了。

import { validateRound, MAX_BODY, JUAN_IDS, DOMAIN_KEYS, ENDING_KEYS, TONE_KEYS, TOPIC_KEYS } from '../../src/core/stat-schema.js';

const PER_IP_DAILY = 60;
const GLOBAL_DAILY = 5000;
const WINDOWS = [1, 7]; // GET 只给当天或近 7 天

const bump = (db, k) =>
  db.prepare('INSERT INTO hits (k, n) VALUES (?, 1) ON CONFLICT (k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(k).first('n');

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// 先计 IP，再计全站：被拒的单个 IP 不会占用全站名额。键带 "s" 以免和通灵的计数混在一起
async function overLimit(db, request, day) {
  const ip = (await sha256(request.headers.get('cf-connecting-ip') || 'unknown')).slice(0, 16);
  if ((await bump(db, `${day}:s:${ip}`)) > PER_IP_DAILY) return true;
  const total = await bump(db, `${day}:s*`);
  if (total === 1) await db.prepare('DELETE FROM hits WHERE k < ?').bind(day).run(); // 每天首次时清掉旧日期
  return total > GLOBAL_DAILY;
}

const bad = (why) => Response.json({ error: why }, { status: 400 });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: 'DB binding missing' }, { status: 503 });
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    return Response.json({ error: 'json only' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return Response.json({ error: 'too large' }, { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY) return Response.json({ error: 'too large' }, { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return bad('bad json');
  }
  const v = validateRound(body);
  if (!v.ok) return bad(v.why);

  try {
    const day = dayOf();
    if (await overLimit(env.DB, request, day)) return new Response(null, { status: 204 });
    const r = v.row;
    await env.DB.prepare(
      'INSERT INTO rounds (day, juan, domain, ending, result, dur, asked, qtone, qtopic, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(day, r.juan, r.domain, r.ending, r.result, r.dur, r.asked, r.qtone, r.qtopic, r.theme).run();
    return new Response(null, { status: 204 });
  } catch (err) {
    return Response.json({ error: String(err?.message || err).slice(0, 160) }, { status: 503 });
  }
}

// GET ?juan=qian&days=1|7  →  { juan, days, n, domains, endings, topics, tones, results }，各为 { 键: 局数 }
export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ error: 'DB binding missing' }, { status: 503 });
  const q = new URL(request.url).searchParams;
  const juan = q.get('juan');
  const days = Number(q.get('days') || 1);
  if (!JUAN_IDS.includes(juan) || !WINDOWS.includes(days)) return bad('bad query');
  const from = dayOf(Date.now() - (days - 1) * 86400000);
  try {
    const count = (col) =>
      env.DB.prepare(`SELECT ${col} k, COUNT(*) n FROM rounds WHERE juan = ? AND day >= ? AND ${col} IS NOT NULL GROUP BY ${col}`).bind(juan, from);
    // 列名只来自下面这张常量表，不接受外部输入
    const cols = ['domain', 'ending', 'qtopic', 'qtone', 'result'];
    const [total, ...rest] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) n FROM rounds WHERE juan = ? AND day >= ?').bind(juan, from),
      ...cols.map(count),
    ]);
    const asMap = (res, keys) => {
      const m = {};
      for (const row of res.results) if (!keys || keys.includes(row.k)) m[row.k] = row.n;
      return m;
    };
    const out = {
      juan, days, n: total.results[0]?.n ?? 0,
      domains: asMap(rest[0], DOMAIN_KEYS),
      endings: asMap(rest[1], ENDING_KEYS),
      topics: asMap(rest[2], TOPIC_KEYS),
      tones: asMap(rest[3], TONE_KEYS),
      results: asMap(rest[4]),
    };
    return Response.json(out, { headers: { 'cache-control': 'public, max-age=300' } });
  } catch (err) {
    return Response.json({ error: String(err?.message || err).slice(0, 160) }, { status: 503 });
  }
}
