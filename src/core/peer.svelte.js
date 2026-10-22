// "和你一样的人"：结局时读回匿名统计的聚合，生成大师的一句话，放进结局坦白（Confess.svelte）。
// 读不到聚合（离线、本地预览）或局已经换了，就什么也不显示。

import { fetchAggregate } from './stat.js';
import { pickLine, MIN_SAMPLE } from './peer-lines.js';
import { classifyQuestion } from './question-class.js';

export const peer = $state({ line: '' });

export function resetPeer() {
  peer.line = '';
}

export async function loadPeer(ctx, game, endKey, seed) {
  resetPeer();
  if (!game.statData) return;
  const rid = ctx.round.id;
  try {
    const d = game.statData();
    const cls = d.asked ? classifyQuestion(d.question) : { tone: null, topic: null };
    const mine = { juan: ctx.juan.id, domain: d.domain, ending: endKey, result: d.result, qtopic: cls.topic, qtone: cls.tone };
    let agg = await fetchAggregate(ctx.juan.id, 1);
    let span = '今天';
    if (agg && agg.n < MIN_SAMPLE) {
      const week = await fetchAggregate(ctx.juan.id, 7);
      if (week) { agg = week; span = '这几天'; }
    }
    if (ctx.round.id !== rid) return; // 玩家已经开了新的一局
    peer.line = pickLine(agg, mine, span, seed) ?? '';
  } catch {
    /* 静默 */
  }
}
