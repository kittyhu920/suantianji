// 只给作者看的完整聚合（作者统计页 /admin/ 调用）。
// 令牌在 Authorization: Bearer 里，与环境变量 STATS_TOKEN 常量时间比较；未设置 STATS_TOKEN 时一律拒绝。
// 设置：npx wrangler pages secret put STATS_TOKEN --project-name suantianji（令牌由作者自己定，不进仓库）。

const enc = new TextEncoder();

// 先各自哈希成定长再逐字节比较，耗时与内容、长度无关
async function sameToken(given, expected) {
  const [a, b] = await Promise.all([given, expected].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const deny = () => Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

// 列名只来自这张常量表，不接受外部输入
const DIMS = ['domain', 'ending', 'result', 'qtopic', 'qtone', 'dur', 'theme', 'asked'];

export async function onRequestGet({ request, env }) {
  const expected = env.STATS_TOKEN;
  if (!expected || typeof expected !== 'string') return deny();
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m || !(await sameToken(m[1], expected))) return deny();
  if (!env.DB) return Response.json({ error: 'DB binding missing' }, { status: 503 });

  const days = Math.min(365, Math.max(1, Math.floor(Number(new URL(request.url).searchParams.get('days'))) || 30));
  const from = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  try {
    const [byDay, ...dims] = await env.DB.batch([
      env.DB.prepare('SELECT day, juan, COUNT(*) n FROM rounds WHERE day >= ? GROUP BY day, juan ORDER BY day').bind(from),
      ...DIMS.map((c) => env.DB.prepare(`SELECT juan, ${c} k, COUNT(*) n FROM rounds WHERE day >= ? GROUP BY juan, ${c} ORDER BY juan, n DESC`).bind(from)),
    ]);
    const out = { days, from, byDay: byDay.results, total: byDay.results.reduce((s, r) => s + r.n, 0), dims: {} };
    DIMS.forEach((c, i) => { out.dims[c] = dims[i].results; });
    return Response.json(out, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: String(err?.message || err).slice(0, 160) }, { status: 503 });
  }
}
