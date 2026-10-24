<script>
  // 观象：仪式完了，书滑到桌子中央、摊开，里面是它替你写的命书（core/book/Reader.svelte 读）：
  // 扉页 → 兆（刻了辞的甲）与解兆 → 灼的过程 → 判词 → 坦白 → 账本 → 命盘 → 四种结局。这一屏只登记页与页脚的按钮。
  import Spread from '../../core/Spread.svelte';
  import ReadFoot from '../../core/book/ReadFoot.svelte';
  import { composeBook, PRIVACY } from '../../core/book/pages.js';
  import { peer } from '../../core/peer.svelte.js';
  import { omenPages, burnPages } from './book.js';
  import { DOMAINS, ENDINGS } from './data.js';
  import { loomStyle } from './loom-style.js';

  let { ctx, game } = $props();
  const { S } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const z = game.decisive() && $state.snapshot(game.decisive());
  const fig = game.figureData();
  const burns = S.burns.map((b) => ({ ...$state.snapshot(b), metrics: game.crackOf(b).metrics }));
  const cur = game.decisiveIdx();
  const override = S.override;
  const domain = S.domain && DOMAINS[S.domain];
  const domainKey = S.domain;
  const question = S.question;
  const zhan = S.zhan;
  const throws = game.loomThrows();
  const ending = ENDINGS[e.endKey];
  const now = new Date();
  const date = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没灼，所以什么也没织出来。空白，也是一种回答。';

  const pages = () => composeBook({
    front: { juan: ctx.juan, domain, question, date, seed: e.seed },
    results: omenPages({ fig, omenKey: z?.omen, zhan, state: e.state, domain, domainKey }),
    records: burnPages({ burns, cur, override, sec: ctx.sec }),
    verdict: { ending, lead: ending.lead[e.tone], turn: ['不过，在你灼龟的时候，', '我也在给你算命。'], seed: e.seed },
    confess: { items: game.confessItems(), peer: peer.line, critique: ending.critique },
    oracle: null,
    ledger: { rows: game.ledgerRows(), privacy: PRIVACY },
    loom: {
      seed: e.seed, throws, style: loomStyle, text: caption,
      legend: '每灼一次，织一束丝：平直的是吉，起伏的是小吉，收窄的是亡尤，赭红分叉的是弗吉与有祟；被你弃掉的那一灼，颜色淡些；改判的那一束，在中缝断开，由朱笔接上。',
    },
    endings: { endings: ENDINGS, got: e.got, current: e.endKey, note: '这块甲上刻的是楷书。真正的甲骨文，要到 1899 年才被人认出来。' },
  });
</script>

<Spread hint="点书页的左右半边、拖页角，或按方向键，翻页读。想带走，就点“保存这一卜”。" book={pages}>
  {#snippet foot()}<ReadFoot {ctx} {game} again="再卜一次" onagain={game.playAgain} save="保存这一卜" />{/snippet}
</Spread>
