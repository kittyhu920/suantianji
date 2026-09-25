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

export async function onRequestPost({ request, env }) {
  if (!env.AI) return Response.json({ error: 'AI binding missing' }, { status: 503 });

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
