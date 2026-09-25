// 通灵模式：Pages Function + Workers AI binding（无需外部 API Key）
// 前端 12 秒超时后自动回落离线判词，所以这里失败只需返回错误码。

// 均为 Workers Free 计划可用的模型；前一个失败时依次尝试下一个
const MODELS = ['@cf/zai-org/glm-4.7-flash', '@cf/google/gemma-4-26b-a4b-it'];

const SYSTEM = `你是一位通晓《周易》与唐宋诗词的老先生，同时是一名冷静的算法社会学者。
你要为一场“被算法旁观的求签问卦”写一段批注。
要求：
1. 先写两句七言古雅批语，扣住所得签名、卦名与所问领域；
2. 再用一两句现代白话，点出这次问卦与推荐算法、数据画像之间的相似之处，语气克制，不说教；
3. 全文 60 至 110 字，不用 Markdown，不用引号括起全文；
4. 不做具体的医疗、投资、法律判断，不预言灾祸，不评价玩家的人格。`;

const clip = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);

// 限流：免费额度每天 10,000 Neurons（UTC 零点重置）。单次最坏约 46 Neurons
// （输入约 400 token，输出上限 1200 token），全站 200 次/天即使全按最坏算也不超额。
const PER_IP_DAILY = 10;
const GLOBAL_DAILY = 200;

const bump = (db, k) =>
  db.prepare('INSERT INTO hits (k, n) VALUES (?, 1) ON CONFLICT (k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(k).first('n');

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 先计 IP，再计全站：被拒的单个 IP 不会占用全站名额。IP 只存哈希。
async function overLimit(db, request) {
  const day = new Date().toISOString().slice(0, 10);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if ((await bump(db, `${day}:${(await sha256(ip)).slice(0, 16)}`)) > PER_IP_DAILY) return 'ip';
  const total = await bump(db, `${day}:*`);
  if (total === 1) await db.prepare('DELETE FROM hits WHERE k < ?').bind(day).run(); // 每天首次调用时清掉旧日期
  return total > GLOBAL_DAILY ? 'global' : null;
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return Response.json({ error: 'AI binding missing' }, { status: 503 });
  if (!env.DB) return Response.json({ error: 'DB binding missing' }, { status: 503 });

  // 在读请求体之前拦下：超限时玩家写的"心中所问"不会进入服务端
  let limited;
  try {
    limited = await overLimit(env.DB, request);
  } catch (err) {
    return Response.json({ error: `limiter: ${String(err?.message || err).slice(0, 160)}` }, { status: 503 });
  }
  if (limited) return Response.json({ error: 'rate limited', scope: limited }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }

  const sign = body.sign
    ? `签「${clip(body.sign.name, 8)}」（${clip(body.sign.level, 4)}），签诗：${(body.sign.poem || []).map((l) => clip(l, 9)).join('，')}`
    : '未得签';
  const user = [
    `所问领域：${clip(body.domain, 6) || '未选'}`,
    `心中所问：${clip(body.question, 40) || '（未写）'}`,
    sign,
    `卦：${clip(body.ben, 6) || '未成'} → ${clip(body.zhi, 6) || '未成'}`,
    `结局：${clip(body.ending, 4)}`,
    `系统画像：${clip(body.persona, 6)}`,
  ].join('\n');

  let lastError = 'no model';
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        max_tokens: 1200,
        temperature: 0.8,
        // 两个模型默认都会先“思考”，会把 token 用完而正文为空，这里关掉
        chat_template_kwargs: { enable_thinking: false },
        reasoning_effort: 'low',
      });
      const raw = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
      const text = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) return Response.json({ text: text.slice(0, 400), model });
      lastError = `${model}: empty ${JSON.stringify(out).slice(0, 300)}`;
    } catch (err) {
      lastError = `${model}: ${String(err?.message || err).slice(0, 160)}`;
    }
  }
  return Response.json({ error: lastError }, { status: 502 });
}
