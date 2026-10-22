// 一局的收尾：各卷通用的结局编排。
//
//   finishRound(ctx, game)
//     1. game.attitude()      本卷的映射，返回 'zun' | 'ni' | 'po' | 'mi'
//     2. game.ledgerData()    行为账本的原始数据，由它定命盘的种子（同样的行为 → 同一幅命盘）
//     3. game.memory(endKey)  这一局要留给“大师记得你”的一条记录；返回 null 就不记
//     4. 写入已得的结局
//     5. game.onEnd({ endKey, seed, ledgerData, got, prev })  卷把结果收进自己的状态（prev 是这一局之前的记录）
//     6. 换到 end 屏，一声铜钟
//     7. 匿名统计：game.statData() 整理成不含原文的一条上报（stat.js），再读回聚合，生成结局坦白里"和你一样的人"那一句（peer.svelte.js）；失败一律静默
//     8. 通灵：勾了开关就直接请大师细说（game.askOracle()），没勾就给一个可以点的入口（game.canOracle() 为假则不给）

import { oracle, offerOracle } from './oracle.svelte.js';
import { reportRound } from './stat.js';
import { loadPeer } from './peer.svelte.js';

export function finishRound(ctx, game) {
  if (ctx.round.finished) return null;
  ctx.round.finished = true;

  const endKey = game.attitude();
  const ledgerData = game.ledgerData();
  const seed = ctx.ledger.seed(ledgerData);
  const prev = ctx.memory.get();
  const mem = game.memory?.(endKey);
  if (mem) ctx.memory.set(mem);
  const got = ctx.endings.record(endKey);

  game.onEnd({ endKey, seed, ledgerData, got, prev });
  ctx.show('end');
  ctx.sfx.bronze(262, 3.2, 0.16);

  reportRound(ctx, game, endKey);
  loadPeer(ctx, game, endKey, seed);

  if (oracle.enabled) game.askOracle();
  else offerOracle(game.canOracle ? game.canOracle() : true);
  return endKey;
}
