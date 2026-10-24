<script>
  // 观象：仪式完了，书滑到桌子中央、摊开，里面是它替你写的命书（core/book/Reader.svelte 读）：
  // 扉页 → 卦、解卦、六位二进制 → 起卦的过程 → 判词 → 坦白 → 账本 → 命盘 → 四种结局。这一屏只登记页与页脚的按钮。
  import Spread from '../../core/Spread.svelte';
  import ReadFoot from '../../core/book/ReadFoot.svelte';
  import { composeBook, PRIVACY } from '../../core/book/pages.js';
  import { peer } from '../../core/peer.svelte.js';
  import { hexPages, castPages, noHexPages } from './book.js';
  import { xiantianValue } from './yao.js';
  import { loomStyle } from './loom-style.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const cast = game.lastCast() && $state.snapshot(game.lastCast());
  const casts = $state.snapshot(S.casts);
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
    results: cast
      ? hexPages({ hex: cast.hex, changed: cast.changed, vs: cast.lines.map((l) => l.v), domain, advice: domain ? cast.hex.advice[S.domain] : null, bits: cast.bin, value: xiantianValue(cast.bin), seed: e.seed })
      : noHexPages(),
    records: casts.length ? castPages({ casts, final: !!cast }) : [],
    verdict: { ending, lead: ending.lead, turn: ['不过，在你起卦的时候，', '我也在给你算命。'], seed: e.seed },
    confess: { items: game.confessItems(), peer: peer.line, critique: ending.critique },
    oracle: null,
    ledger: { rows: game.ledgerRows(), privacy: PRIVACY },
    loom: { seed: e.seed, throws, style: loomStyle, text: caption, legend: '每掷一次，织一束丝：少阳的丝平直，少阴的丝在中间分开；老阳的丝胀成一个圈，老阴的丝在中间交叉，它们是变爻，丝里带一点朱；被你弃掉的那一卦，颜色淡些。' },
    endings: { endings: db.endings, got: e.got, current: e.endKey },
  });
</script>

<Spread hint="点书页的左右半边、拖页角，或按方向键，翻页读。想带走，就点“保存这一卦”。" book={pages}>
  {#snippet foot()}<ReadFoot {ctx} {game} again="再起一卦" save="保存这一卦" />{/snippet}
</Spread>
