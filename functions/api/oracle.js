// 通灵模式：Pages Function + Workers AI binding（无需外部 API Key）
// 前端 25 秒超时后自动回落离线解签，所以这里失败只需返回错误码。

// 均为 Workers Free 计划可用的模型；前一个失败时依次尝试下一个
const MODELS = ['@cf/zai-org/glm-4.7-flash', '@cf/google/gemma-4-26b-a4b-it'];

const SYSTEM = `你是庙里一位和气、眼尖的解签师父，也是这场求签里一直在旁边看着对方的"大师"。说话像跟晚辈聊天，只用大白话。
你会拿到三样东西：这支签、他写下的问题、以及你一路观察到的他（每一步用了多久、在哪里停下、有没有重求签、第几次来）。
请严格按下面的格式输出两段，不要多写别的：

【解签】
（100 至 160 字，一段话）先用一两句说这支签在讲什么，可参考解曰和大意但要用自己的话；他写了问题就直接回答，没写就按所问领域给建议，建议要具体、做得到；
交代掷筊：三个圣杯说明签作数；出现阴杯说明神明不允，若他偏要这支，就点出是他自己拿了主意；
再挑一两处你观察到的细节（比如在哪一步停得最久、重求了几次），说出他自己可能没意识到的地方——不要罗列数据，要像看穿了他。

【实话】
（两句，每句单独一行，每句不超过 40 字）用"我"的口吻，坦白你是凭他的哪个举动看穿他的。要具体到某个动作，不说空话，不说教。

规矩：不用文言，不用 Markdown，不写序号；不做具体的医疗、投资、法律判断；只要问题涉及身体、睡眠或情绪，【解签】里必须建议他去看医生或找专业人士；不预言灾祸，不评价他的人格；不要说出"犹疑型"这类画像标签。`;

const clip = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').slice(0, n);

// 限流：免费额度每天 10,000 Neurons（UTC 零点重置）。单次输入约 650 token、输出上限 900 token，
// 典型约 12 Neurons，最坏约 36 Neurons；全站 200 次/天即使全按最坏算也不超额。
const PER_IP_DAILY = 10;
const GLOBAL_DAILY = 200;

const bump = (db, k) =>
  db.prepare('INSERT INTO hits (k, n) VALUES (?, 1) ON CONFLICT (k) DO UPDATE SET n = n + 1 RETURNING n')
    .bind(k).first('n');

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const today = () => new Date().toISOString().slice(0, 10);
const ipKey = async (request, day) => `${day}:${(await sha256(request.headers.get('cf-connecting-ip') || 'unknown')).slice(0, 16)}`;

// 先计 IP，再计全站：被拒的单个 IP 不会占用全站名额。IP 只存哈希。
async function overLimit(db, request) {
  const day = today();
  if ((await bump(db, await ipKey(request, day))) > PER_IP_DAILY) return 'ip';
  const total = await bump(db, `${day}:*`);
  if (total === 1) await db.prepare('DELETE FROM hits WHERE k < ?').bind(day).run(); // 每天首次调用时清掉旧日期
  return total > GLOBAL_DAILY ? 'global' : null;
}

// 今天还能请大师细说几次：只读，不计数
export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ error: 'DB binding missing' }, { status: 503 });
  try {
    const day = today();
    const get = (k) => env.DB.prepare('SELECT n FROM hits WHERE k = ?').bind(k).first('n');
    const [mine, all] = await Promise.all([get(await ipKey(request, day)), get(`${day}:*`)]);
    const remaining = Math.max(0, Math.min(PER_IP_DAILY - (mine ?? 0), GLOBAL_DAILY - (all ?? 0)));
    return Response.json({ remaining, limit: PER_IP_DAILY }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return Response.json({ error: String(err?.message || err).slice(0, 160) }, { status: 503 });
  }
}

// 模型按【解签】【实话】两段输出；缺了标记就整段当作解签
function parse(text) {
  const m = text.match(/【解签】([\s\S]*?)(?:【实话】([\s\S]*))?$/);
  if (!m) return { text: text.slice(0, 500), shi: [] };
  const jie = m[1].trim().slice(0, 500);
  const shi = (m[2] || '')
    .split(/\n+/)
    .map((l) => l.replace(/^[\s\-*·•\d.、）)]+/, '').trim())
    .filter((l) => l.length >= 4)
    .slice(0, 3)
    .map((l) => l.slice(0, 60));
  return { text: jie || text.slice(0, 500), shi };
}

const BEHAVIOR_KEYS = ['时辰', '设备', '选方向用时', '摇签', '每次掷前犹豫', '重求签', '发呆', '离开页面', '第几次来', '上次的签', '我的判断'];

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
  const lines = [
    `所问领域：${clip(body.domain, 6) || '未选'}`,
    `心中所问：${clip(body.question, 40) || '（未写）'}`,
    sign,
    `掷筊：${clip(body.cups, 12) || '未掷'}（${clip(body.verdict, 20)}）`,
    `结局：${clip(body.ending, 4)}`,
    `系统画像：${clip(body.persona, 6)}（只用来揣摩语气，不要把这个词说出来）`,
  ];
  const b = body.behavior && typeof body.behavior === 'object' ? body.behavior : {};
  const seen = BEHAVIOR_KEYS.filter((k) => b[k]).map((k) => `- ${k}：${clip(b[k], 60)}`);
  if (seen.length) lines.push('你一路观察到的他：', ...seen);
  // 模型常常忽略系统提示里的这一条，涉及身心时在本次请求里再强调一遍
  if (/身心|睡|失眠|病|痛|抑郁|焦虑|情绪|压力|累/.test(`${body.domain ?? ''}${body.question ?? ''}`)) {
    lines.push('注意：这个问题涉及身体或情绪，回答里必须有一句明确建议对方去看医生或找心理咨询师。');
  }
  const user = lines.join('\n');

  let lastError = 'no model';
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        max_tokens: 900,
        temperature: 0.8,
        // 两个模型默认都会先“思考”，会把 token 用完而正文为空，这里关掉
        chat_template_kwargs: { enable_thinking: false },
        reasoning_effort: 'low',
      });
      const raw = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
      const text = String(raw).replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      if (text) return Response.json({ ...parse(text), model });
      lastError = `${model}: empty ${JSON.stringify(out).slice(0, 300)}`;
    } catch (err) {
      lastError = `${model}: ${String(err?.message || err).slice(0, 160)}`;
    }
  }
  return Response.json({ error: lastError }, { status: 502 });
}
