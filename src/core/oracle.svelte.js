// 通灵：把这一局送去云端（functions/api/oracle.js，Workers AI），请 AI 用大白话解读。
// 这里管状态：开关、今日剩余次数、请求与等待；怎么拼请求体、说什么话由各卷决定（见 src/juan/index.js 的 copy）。
// 回话写进命书的一页（pages.js），请求在页脚（ReadFoot.svelte）。
// 回复回来时要与发出请求时的局号比对：玩家已经开了新的一局，就把迟到的回复丢掉。

export const oracle = $state({
  enabled: false, // 勾了"通灵模式"
  remaining: null, // 今日剩余次数；本地离线预览没有接口时为 null，不显示
  limit: null,
  phase: 'hidden', // hidden | offer（可以请大师细说）| loading | text
  text: '',
});

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

/**
 * 请大师细说。body 由卷拼好；question 是玩家写的问题（用来判断原文有没有离开设备）。
 * 返回 { sent, shi }：sent 为原文是否已送去云端，shi 为 AI 看出的"实话"；局已经换了则返回 { stale: true }。
 */
export async function consultOracle(ctx, { body, question, onShi }) {
  oracle.phase = 'loading';
  oracle.text = '';
  ctx.gloss('我把你的画像送去了云端');
  let sent = !!question;
  let shi = [];
  const rid = ctx.round.id;
  const stale = () => ctx.round.id !== rid;
  const STALE = { stale: true };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000); // 白话解签较长，云端偶尔要十几秒
  try {
    const res = await fetch('/api/oracle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    if (stale()) return STALE;
    if (res.status === 429) {
      sent = false; // 限流在读请求体之前拦下，问题没有被读取
      const { scope } = await res.json().catch(() => ({}));
      if (stale()) return STALE;
      const limited = ctx.copy.oracleLimited ?? {};
      oracle.phase = 'text';
      oracle.text = limited[scope] ?? limited.global ?? '';
      ctx.gloss('云端没回话，以我的为准');
      return { sent, shi };
    }
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (stale()) return STALE;
    if (!data.text) throw new Error('empty');
    ctx.gloss('云端回话了');
    if (Array.isArray(data.shi) && data.shi.length) { shi = data.shi.slice(0, 3); onShi?.(shi); }
    oracle.text = data.text; // 回话整段交给命书（画成一页，见 core/book/pages.js 的 oraclePages）
    oracle.phase = 'text';
  } catch {
    if (stale()) return STALE;
    oracle.phase = 'text';
    oracle.text = ctx.copy.oracleFail ?? '';
    ctx.gloss('云端没回话，以我的为准');
  } finally {
    clearTimeout(timer);
    refreshQuota();
  }
  return stale() ? STALE : { sent, shi };
}
