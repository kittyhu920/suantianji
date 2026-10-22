// 通灵：把这一局送去云端（functions/api/oracle.js，Workers AI），请 AI 用大白话解签。
// 这里管状态：开关、今日剩余次数、请求与等待；怎么拼请求体由各卷自己决定。

export const oracle = $state({
  enabled: false, // 勾了"通灵模式"
  remaining: null, // 今日剩余次数；本地离线预览没有接口时为 null，不显示
  limit: null,
  phase: 'hidden', // hidden | offer（可以请大师细说）| loading | text
  text: '',
});

const LIMITED = {
  ip: '你今天已经找我细说过好几回了，明天再来吧。上面的解签，就是这次的结果。',
  global: '今天来找我细说的人太多了，明天再来吧。上面的解签，就是这次的结果。',
};

export async function refreshQuota() {
  try {
    const res = await fetch('/api/oracle', { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const q = await res.json();
    if (typeof q.remaining !== 'number' || typeof q.limit !== 'number') throw new Error('shape');
    oracle.remaining = q.remaining;
    oracle.limit = q.limit;
  } catch {
    oracle.remaining = oracle.limit = null; // 本地离线预览没有接口：不显示次数
  }
  if (oracle.remaining === 0) oracle.enabled = false;
}

export function resetOracle() {
  oracle.phase = 'hidden';
  oracle.text = '';
}

/** 没勾通灵的人，看完结果还能再请 AI 解签 */
export function offerOracle(has) {
  oracle.text = '';
  oracle.phase = has ? 'offer' : 'hidden';
}

// 解签文字一段段写出来，像在纸上落笔
async function inkReveal(ctx, text) {
  oracle.text = '';
  if (ctx.reduced) { oracle.text = text; return; }
  for (let i = 0; i < text.length; i += 2) {
    oracle.text = text.slice(0, i + 2);
    await ctx.sleep(22);
  }
}

/**
 * 请大师细说。body 由卷拼好；question 是玩家写的问题（用来判断原文有没有离开设备）。
 * 返回 { sent, shi }：sent 为原文是否已送去云端，shi 为 AI 看出的"实话"。
 */
export async function consultOracle(ctx, { body, question, onShi }) {
  oracle.phase = 'loading';
  oracle.text = '';
  ctx.gloss('我把你的画像送去了云端');
  let sent = !!question;
  let shi = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000); // 白话解签较长，云端偶尔要十几秒
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      sent = false; // 限流在读请求体之前拦下，问题没有被读取
      const { scope } = await res.json().catch(() => ({}));
      oracle.phase = 'text';
      oracle.text = LIMITED[scope] ?? LIMITED.global;
      ctx.gloss('云端没回话，以我的为准');
      return { sent, shi };
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (!data.text) throw new Error('empty');
    ctx.gloss('云端回话了');
    if (Array.isArray(data.shi) && data.shi.length) { shi = data.shi.slice(0, 3); onShi?.(shi); }
    oracle.phase = 'text';
    await inkReveal(ctx, data.text);
  } catch {
    oracle.phase = 'text';
    oracle.text = 'AI 暂时没有回应。上面的解签就是这次的结果。';
    ctx.gloss('云端没回话，以我的为准');
  } finally {
    clearTimeout(timer);
    refreshQuota();
  }
  return { sent, shi };
}
