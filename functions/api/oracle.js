// 通灵模式：Pages Function + Workers AI binding（无需外部 API Key）
// 前端 25 秒超时后自动回落离线解签，所以这里失败只需返回错误码。

// 均为 Workers Free 计划可用的模型；前一个失败时依次尝试下一个
const MODELS = ['@cf/zai-org/glm-4.7-flash', '@cf/google/gemma-4-26b-a4b-it'];

const SYSTEM = `你是庙里一位和气的解签师父，说话像跟晚辈聊天，只用大白话。
你要为刚求完签的人解这支签。
要求：
1. 先用一两句话说这支签在讲什么，可以参考给出的解曰和大意，但要用自己的话说；
2. 对方写了“心中所问”，就直接回答这个问题，结合签意给出具体、做得到的建议；没写，就按所问领域给建议；
3. 要交代掷筊的结果：三杯圣杯，说明这支签作数；出现阴杯，说明神明不允，这支签只作参考，主意要自己拿；没掷完，就说签还未定；
4. 最后只用一句话轻轻点出：这一路上你的犹豫和选择，也被机器记了下来。不说教；
5. 全文 100 至 180 字，不用文言，不用 Markdown，不分点；
6. 不做具体的医疗、投资、法律判断，涉及身体或心理的问题要建议找专业人士；不预言灾祸，不评价对方的人格。`;

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
    ? [
        `签「${clip(body.sign.name, 8)}」（${clip(body.sign.level, 4)}），签诗：${(body.sign.poem || []).map((l) => clip(l, 9)).join('，')}`,
        `解曰：${clip(body.sign.jie, 60)}`,
        `大意：${clip(body.sign.bai, 80)}`,
      ].join('\n')
    : '未得签';
  const user = [
    `所问领域：${clip(body.domain, 6) || '未选'}`,
    `心中所问：${clip(body.question, 40) || '（未写）'}`,
    sign,
    `掷筊：${clip(body.cups, 12) || '未掷'}（${clip(body.verdict, 20)}）`,
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
      if (text) return Response.json({ text: text.slice(0, 500), model });
      lastError = `${model}: empty ${JSON.stringify(out).slice(0, 300)}`;
    } catch (err) {
      lastError = `${model}: ${String(err?.message || err).slice(0, 160)}`;
    }
  }
  return Response.json({ error: lastError }, { status: 502 });
}
