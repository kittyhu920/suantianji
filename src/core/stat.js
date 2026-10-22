// 匿名统计的前端：每局结束上报一条，再读回聚合给结局页用。字段与隐私约定见 stat-schema.js 与 docs/DESIGN.md "统计与隐私"。
//
// 各卷通过 game.statData() 交出这一局：
//   { domain, result, question, asked, ms }
//     domain    领域键（gong / yuan / shen）或 null
//     result    本局结果标识：签号、卦序（数字或数字字符串）或兆象键；没有结果为 null
//     question  玩家写的问题原文——只在这里用来做本地归类，永远不会进入上报
//     asked     玩家是否真的写了问题（卜卷没写时会自拟一条，那不算）
//     ms        本局用时（毫秒）
//
// 上报失败一律静默；带 ?debug 时不发送。

import { classifyQuestion } from './question-class.js';
import { durBucket, validateRound } from './stat-schema.js';

const debug = () => typeof location !== 'undefined' && location.search.includes('debug');

// 主题（昼 / 夜）：读 <html data-theme>，没有就不报
function theme() {
  const t = typeof document !== 'undefined' ? document.documentElement.dataset.theme : '';
  return /^(dark|night)$/.test(t) ? 'night' : /^(light|day)$/.test(t) ? 'day' : null;
}

/** 把一局整理成可以上报的记录。问题原文只经过 classifyQuestion，返回值里没有它 */
export function buildRound(juanId, endKey, data) {
  const asked = !!data.asked && !!String(data.question ?? '').trim();
  const cls = asked ? classifyQuestion(data.question) : { tone: null, topic: null };
  const row = {
    juan: juanId,
    domain: data.domain ?? null,
    ending: endKey,
    result: data.result == null ? null : String(data.result),
    dur: durBucket(Math.max(0, Number(data.ms) || 0)),
    asked,
    qtone: cls.tone,
    qtopic: cls.topic,
    theme: theme(),
  };
  return validateRound(row).ok ? row : null; // 自己先过一遍服务端的校验
}

const sent = new Set();
let posting = Promise.resolve(); // 最近一次上报；读聚合前等它一下，聚合里才有自己这一局

/** 上报一局（每个局号只报一次）。永远不抛错 */
export function reportRound(ctx, game, endKey) {
  try {
    if (debug() || !game.statData || sent.has(`${ctx.juan.id}:${ctx.round.id}`)) return null;
    const row = buildRound(ctx.juan.id, endKey, game.statData());
    if (!row) return null;
    sent.add(`${ctx.juan.id}:${ctx.round.id}`);
    posting = fetch('/api/stat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(row),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
    return row;
  } catch {
    return null;
  }
}

/** 读某卷当天（days=1）或近 7 天（days=7）的聚合；失败返回 null */
export async function fetchAggregate(juanId, days) {
  try {
    await Promise.race([posting, new Promise((r) => setTimeout(r, 2500))]);
    const res = await fetch(`/api/stat?juan=${encodeURIComponent(juanId)}&days=${days}`, { credentials: 'omit' });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const agg = await res.json();
    return typeof agg?.n === 'number' ? agg : null;
  } catch {
    return null;
  }
}
