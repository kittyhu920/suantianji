<script>
  // 观象：解签、判词、坦白、行为账本、命盘、四种结局，分成三个对页一页页翻着看。结局之后的“再求一签”回到定盘。
  import OracleBox from '../../core/OracleBox.svelte';
  import EndingBlock from '../../core/end/EndingBlock.svelte';
  import EndPages from '../../core/end/EndPages.svelte';
  import Confess from '../../core/end/Confess.svelte';
  import Ledger from '../../core/end/Ledger.svelte';
  import LoomFigure from '../../core/end/LoomFigure.svelte';
  import EndingsList from '../../core/end/EndingsList.svelte';
  import { CUP_NAMES, signNo } from './game.svelte.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const sign = S.sign && $state.snapshot(S.sign);
  const domain = S.domain && db.domains[S.domain];
  const cups = S.cups.map((c) => c.kind);
  const throws = $state.snapshot(S.throws);
  const ending = db.endings[e.endKey];
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没掷，所以什么也没织出来。空白，也是一种回答。';
</script>

{#snippet l1()}
  <p class="cups-pair" id="cups-pair">
    {#if cups.length}{cups.map((k) => CUP_NAMES[k]).join(' · ')}{:else}还没掷筊<small>{sign ? '签已抽出，但没有掷筊' : '还没抽签'}</small>{/if}
  </p>
  {#if sign}
    <article class="jieqian" id="jieqian" aria-labelledby="jq-h">
      <h3 id="jq-h">解签</h3>
      <p class="jq-state" id="jq-state" data-state={e.state.key}>{e.state.text}</p>
      <p class="jq-title"><span id="jq-name">{signNo(sign)}　{sign.name}</span><span class="sign-level" id="jq-level" data-tone={db.levels[sign.level]}>{sign.level}</span></p>
      <p class="jq-row"><b>这支签在说什么</b><span id="jq-bai">{sign.bai}</span></p>
      {#if domain}<p class="jq-row"><b id="jq-advice-h">关于{domain.desc}</b><span id="jq-advice">{sign.advice[S.domain]}</span></p>{/if}
    </article>
  {/if}
{/snippet}

{#snippet r1()}
  <EndingBlock {ctx} {ending} lead={ending.lead[e.tone]} turn={['不过，在你求签的时候，', '我也在给你算命。']} />
{/snippet}

{#snippet l2()}
  <Confess items={game.confessItems()} />
  <p class="critique" id="e-critique">{ending.critique}</p>
{/snippet}

{#snippet r2()}
  <OracleBox {ctx} onAsk={game.askOracle} />
{/snippet}

{#snippet l3()}
  <Ledger rows={game.ledgerRows()} part="a" />
{/snippet}

{#snippet r3()}
  <Ledger rows={game.ledgerRows()} part="b" />
{/snippet}

{#snippet l4()}
  <EndingsList endings={db.endings} got={e.got} current={e.endKey} />
  <a class="about-link" href="/about/">关于这件作品</a>
{/snippet}

{#snippet r4()}
  <LoomFigure {ctx} seed={e.seed} {throws} {caption}>
    <p class="loom-legend">每掷一次，织一束丝：平直的是圣杯，打结的是笑杯，<span>朱砂分叉</span>的是阴杯；被你弃掉的那一掷，颜色淡些。</p>
  </LoomFigure>
{/snippet}

{#snippet foot()}
  <button class="btn btn-ghost" id="btn-again" onclick={game.again}>再求一签</button>
  <button class="btn btn-primary" id="btn-poster" onclick={() => { game.posterOpen = true; }}>保存这一签</button>
{/snippet}

<EndPages {ctx} {foot} pages={[
  { name: '观象', sub: '解签与判词', hint: '左页是这支签的解，右页是我的判词。往后翻，还有我对你的实话、账本和命盘。', left: l1, right: r1 },
  { name: '实话', sub: '我怎么算你', hint: '左页是我把旁批里的数字怎么算出来的，右页可以请我用大白话细说。', left: l2, right: r2 },
  { name: '账本', sub: '刚才的每一步', hint: '刚才的每一步，我都记下了，一页放不下，分在两页上。', left: l3, right: r3 },
  { name: '命盘', sub: '织锦与结局', hint: '右页是用这本账织成的命盘，左页是四种结局的名录。想带走，就点“保存这一签”。', left: l4, right: r4 },
]} />
