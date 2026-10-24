<script>
  // 观象：仪式完了，书滑到桌子中央、摊开，里面是它替你写的命书（core/book/Reader.svelte 读）：
  // 扉页 → 签文与解签 → 掷筊的过程 → 判词 → 坦白 →（通灵）→ 账本 → 命盘 → 四种结局。这一屏只登记页与页脚的按钮。
  import Spread from '../../core/Spread.svelte';
  import ReadFoot from '../../core/book/ReadFoot.svelte';
  import { composeBook, PRIVACY } from '../../core/book/pages.js';
  import { oracle } from '../../core/oracle.svelte.js';
  import { peer } from '../../core/peer.svelte.js';
  import { signPages, cupPages } from './book.js';
  import { signNo, signFull } from './game.svelte.js';
  import { loomStyle } from './loom-style.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const sign = S.sign && $state.snapshot(S.sign);
  const domain = S.domain && db.domains[S.domain];
  const question = S.question;
  const throws = $state.snapshot(S.throws);
  const ending = db.endings[e.endKey];
  const now = new Date();
  const date = `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`;
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没掷，所以什么也没织出来。空白，也是一种回答。';

  const pages = () => composeBook({
    front: { juan: ctx.juan, domain, question, date, seed: e.seed },
    results: signPages({ sign, label: sign ? signFull(sign) : '', domain, advice: sign && domain ? sign.advice[S.domain] : null, state: e.state }),
    records: cupPages({ sign, throws, state: e.state }),
    verdict: { ending, lead: ending.lead[e.tone], turn: ['不过，在你求签的时候，', '我也在给你算命。'], seed: e.seed },
    confess: { items: game.confessItems(), peer: peer.line, critique: ending.critique },
    oracle: { title: ctx.copy.oracleTitle, text: oracle.phase === 'text' ? oracle.text : '' },
    ledger: { rows: game.ledgerRows(), privacy: PRIVACY },
    loom: { seed: e.seed, throws, style: loomStyle, text: caption, legend: '每掷一次，织一束丝：平直的是圣杯，打结的是笑杯，分叉带朱的是阴杯；被你弃掉的那一掷，颜色淡些。' },
    endings: { endings: db.endings, got: e.got, current: e.endKey },
  });
</script>

<Spread hint="点书页的左右半边、拖页角，或按方向键，翻页读。想带走，就点“保存这一签”。" book={pages}>
  {#snippet foot()}<ReadFoot {ctx} {game} again="再求一签" save="保存这一签" />{/snippet}
</Spread>
