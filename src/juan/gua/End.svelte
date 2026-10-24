<script>
  // 观象：解卦与判词、坦白（含莱布尼茨与先天八卦图）、行为账本、命盘、四种结局，分成三个对页。结局之后的“再起一卦”回到问事。
  import EndingBlock from '../../core/end/EndingBlock.svelte';
  import EndPages from '../../core/end/EndPages.svelte';
  import Confess from '../../core/end/Confess.svelte';
  import Ledger from '../../core/end/Ledger.svelte';
  import LoomFigure from '../../core/end/LoomFigure.svelte';
  import EndingsList from '../../core/end/EndingsList.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Hexagram from './Hexagram.svelte';
  import { afterChange, xiantianValue, CN_YAO_SHORT } from './yao.js';
  import { BINARY } from './words.js';
  import { loomStyle } from './loom-style.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const cast = game.lastCast() && $state.snapshot(game.lastCast());
  const hex = cast?.hex;
  const changed = cast?.changed;
  const vs = cast?.lines.map((l) => l.v) ?? [];
  const domain = S.domain && db.domains[S.domain];
  const throws = $state.snapshot(S.throws);
  const ending = db.endings[e.endKey];
  const bits = cast?.bin ?? '';
  const value = cast ? xiantianValue(cast.bin) : 0;
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没掷，所以什么也没织出来。空白，也是一种回答。';
</script>

{#snippet l1()}
  {#if cast}
    <p class="cups-pair" id="cast-pair">{hex.name}{#if changed} → {changed.name}{/if}<small>{changed ? '有变爻，本卦之变卦' : '没有变爻'}</small></p>
    <article class="jieqian" id="jiegua-end" aria-labelledby="jg-h">
      <h3 id="jg-h">解卦</h3>
      <div class="end-figs">
        <Hexagram lines={vs} size={96} seed={S.casts.length} label="本卦" />
        {#if changed}<Hexagram lines={afterChange(vs)} size={96} seed={S.casts.length + 9} label="变卦" marks={false} />{/if}
      </div>
      <p class="jq-title"><span>{hex.name}　{hex.lower}下{hex.upper}上</span></p>
      <p class="jq-row"><b>卦辞</b><span>{hex.ci}</span></p>
      <p class="jq-row"><b>这一卦在说什么</b><span>{hex.bai}</span></p>
      {#if domain}<p class="jq-row"><b>关于{domain.desc}</b><span>{hex.advice[S.domain]}</span></p>{/if}
    </article>
  {:else}
    <p class="cups-pair" id="cast-pair">还没起卦<small>钱还没有掷出去</small></p>
  {/if}
{/snippet}

{#snippet r1()}
  <EndingBlock {ctx} {ending} lead={ending.lead} turn={['不过，在你起卦的时候，', '我也在给你算命。']} />
{/snippet}

{#snippet r2()}
  {#if cast}
    <section class="binary" aria-labelledby="bn-h">
      <h3 id="bn-h">{BINARY.title}</h3>
      <p class="binary-lead">{BINARY.lead}</p>
      <ol class="bits" aria-label="六位二进制，自下而上">
        {#each [...bits] as b, i}<li class:is-yang={b === '1'}><small>{CN_YAO_SHORT[i]}</small><span>{b}</span></li>{/each}
      </ol>
      <p class="binary-eq">自下而上读作 <b>{bits}</b>，初爻为最低位，是十进制的 <b>{value}</b>。</p>
      <p>{BINARY.p1(bits, value)}</p>
      <p>{BINARY.p2[0]}<Zhu term="先天八卦">{BINARY.p2[1]}</Zhu>{BINARY.p2[2]}<Zhu term="莱布尼茨">{BINARY.p2[3]}</Zhu>{BINARY.p2[4]}<Zhu term="二进制">{BINARY.p2[5]}</Zhu>{BINARY.p2[6]}</p>
      <p>{BINARY.p3}</p>
      <p>{BINARY.p4}</p>
    </section>
  {/if}
{/snippet}

{#snippet l2()}
  <Confess items={game.confessItems()} />
  <p class="critique" id="e-critique">{ending.critique}</p>
{/snippet}

{#snippet l3()}
  <Ledger rows={game.ledgerRows()} part="a" />
{/snippet}

{#snippet r3()}
  <Ledger rows={game.ledgerRows()} part="b" />
{/snippet}

{#snippet l4()}
  <EndingsList endings={db.endings} got={e.got} current={e.endKey} />
{/snippet}

{#snippet r4()}
  <LoomFigure {ctx} seed={e.seed} {throws} {caption} style={loomStyle}>
    <p class="loom-legend">每掷一次，织一束丝：少阳的丝平直，少阴的丝在中间分开；<span>老阳的丝胀成一个圈，老阴的丝在中间交叉</span>，它们是变爻，丝里带一点朱；被你弃掉的那一卦，颜色淡些。</p>
  </LoomFigure>
{/snippet}

{#snippet foot()}
  <button class="btn btn-ghost" id="btn-again" onclick={game.again}>再起一卦</button>
  {#if cast}<button class="btn btn-primary" id="btn-poster" onclick={() => { game.posterOpen = true; }}>保存这一卦</button>{/if}
{/snippet}

<EndPages {ctx} {foot} pages={[
  { name: '观象', sub: '解卦与判词', hint: '左页是这一卦的解，右页是我的判词。往后翻，还有二进制的秘密、我对你的实话、账本和命盘。', left: l1, right: r1 },
  { name: '二进制', sub: '六十四卦与六位数', hint: '左页是我对你的实话，右页讲这一卦其实是一个数。', left: l2, right: r2 },
  { name: '账本', sub: '刚才的每一步', hint: '刚才的每一步，我都记下了，一页放不下，分在两页上。', left: l3, right: r3 },
  { name: '命盘', sub: '织锦与结局', hint: '右页是用这本账织成的命盘，左页是四种结局的名录。想带走，就点“保存这一卦”。', left: l4, right: r4 },
]} />
