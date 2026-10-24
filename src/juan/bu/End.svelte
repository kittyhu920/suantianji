<script>
  // 观象：兆图与解兆、判词、坦白、行为账本、命盘、四种结局，分成三个对页。结局之后的“再卜一次”回到命辞。
  import EndingBlock from '../../core/end/EndingBlock.svelte';
  import EndPages from '../../core/end/EndPages.svelte';
  import Confess from '../../core/end/Confess.svelte';
  import Ledger from '../../core/end/Ledger.svelte';
  import LoomFigure from '../../core/end/LoomFigure.svelte';
  import EndingsList from '../../core/end/EndingsList.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import OmenFigure from './OmenFigure.svelte';
  import { OMENS } from './omen.js';
  import { DOMAINS, ENDINGS, BAI, ADVICE } from './data.js';

  let { ctx, game } = $props();
  const { S } = game;

  // 屏一挂上，这一局的结果就定了；之后“再卜一次”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const z = game.decisive() && $state.snapshot(game.decisive());
  const f = game.fanBurn() && $state.snapshot(game.fanBurn());
  const crack = z && game.crackOf(z);
  const other = f && game.crackOf(f);
  const carve = $state.snapshot(game.carveData()) ?? null;
  const domain = S.domain && DOMAINS[S.domain];
  const domainKey = S.domain;
  const zhan = S.zhan;
  const throws = game.loomThrows();
  const ending = ENDINGS[e.endKey];
  const omen = z && OMENS[z.omen];
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没灼，所以什么也没织出来。空白，也是一种回答。';
</script>

{#snippet l1()}
  {#if crack}
    <article class="jieqian" id="jieqian" aria-labelledby="jq-h">
      <h3 id="jq-h">解兆</h3>
      <p class="jq-state" id="jq-state" data-state={e.state.key}>{e.state.text}</p>
      <p class="jq-title"><span id="jq-name">兆曰{omen.name}</span><span class="omen-tone" data-tone={omen.tone}>{omen.tone === 'xiong' ? '凶' : '吉'}</span></p>
      <p class="jq-zhan" id="jq-zhan">{zhan}</p>
      <p class="jq-row"><b>这道兆在说什么</b><span id="jq-bai">{BAI[z.omen]}</span></p>
      {#if domain}<p class="jq-row"><b>关于{domain.desc}</b><span id="jq-advice">{ADVICE[z.omen][domainKey]}</span></p>{/if}
      <p class="jq-row jq-note">这些白话与建议是本作自己写的，不是<Zhu term="卜辞" />里的话。</p>
    </article>
  {/if}
{/snippet}

{#snippet r1()}
  {#if crack}
    <OmenFigure {ctx} {crack} spot={z.spot} {other} otherSpot={f?.spot} {carve} class="end-fig" />
  {:else}
    <p class="cups-pair" id="cups-pair">还没灼<small>龟甲还没有裂</small></p>
  {/if}
{/snippet}

{#snippet l2()}
  <Confess items={game.confessItems()} />
  <p class="critique" id="e-critique">{ending.critique}</p>
{/snippet}

{#snippet r2()}
  <EndingBlock {ctx} {ending} lead={ending.lead[e.tone]} turn={['不过，在你灼龟的时候，', '我也在给你算命。']} />
{/snippet}

{#snippet l3()}
  <Ledger rows={game.ledgerRows()} part="a" />
{/snippet}

{#snippet r3()}
  <Ledger rows={game.ledgerRows()} part="b" />
{/snippet}

{#snippet l4()}
  <EndingsList endings={ENDINGS} got={e.got} current={e.endKey} />
  <p class="ledger-intro">这块甲上刻的是楷书。真正的<Zhu term="甲骨文的发现">甲骨文</Zhu>，要到 1899 年才被人认出来。</p>
{/snippet}

{#snippet r4()}
  <LoomFigure {ctx} seed={e.seed} {throws} {caption}>
    <p class="loom-legend">每灼一次，织一束丝：平直的是吉，起伏的是小吉，收窄的是亡尤，<span>赭红分叉</span>的是弗吉与有祟；被你弃掉的那一灼，颜色淡些；改判的那一束，在中缝断开，由朱笔接上。</p>
  </LoomFigure>
{/snippet}

{#snippet foot()}
  <button class="btn btn-ghost" id="btn-again" onclick={game.playAgain}>再卜一次</button>
  <button class="btn btn-primary" id="btn-poster" onclick={() => { game.posterOpen = true; }}>保存这一卜</button>
{/snippet}

<EndPages {ctx} {foot} pages={[
  { name: '观象', sub: '兆图与解兆', hint: '左页是我的解读，右页是刻在甲上的兆。往后翻，还有判词、我对你的实话、账本和命盘。', left: l1, right: r1 },
  { name: '实话', sub: '判词', hint: '左页是我对你的实话，右页是我给你的判词。', left: l2, right: r2 },
  { name: '账本', sub: '刚才的每一步', hint: '刚才的每一步，我都记下了，一页放不下，分在两页上。', left: l3, right: r3 },
  { name: '命盘', sub: '织锦与结局', hint: '右页是用这本账织成的命盘，左页是四种结局的名录。想带走，就点“保存这一卜”。', left: l4, right: r4 },
]} />
