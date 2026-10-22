<script>
  // 观象：解签、结局、坦白、行为账本、命盘、四种结局。结局之后的“再求一签”回到定盘。
  import OracleBox from '../../core/OracleBox.svelte';
  import EndingBlock from '../../core/end/EndingBlock.svelte';
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

<section class="screen screen-end is-active" data-screen="end" aria-labelledby="e-name">
  <div class="end-cols">
    <div class="end-col">
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
      <OracleBox {ctx} onAsk={game.askOracle} />
      <EndingBlock {ctx} {ending} lead={ending.lead[e.tone]} turn={['不过，在你求签的时候，', '我也在给你算命。']} />
    </div>

    <div class="end-col">
      <Confess items={game.confessItems()} />
      <p class="critique" id="e-critique">{ending.critique}</p>
      <Ledger rows={game.ledgerRows()} />
      <LoomFigure {ctx} seed={e.seed} {throws} {caption}>
        <p class="loom-legend">每掷一次，织一束丝：平直的是圣杯，打结的是笑杯，<span>朱砂分叉</span>的是阴杯；被你弃掉的那一掷，颜色淡些。</p>
      </LoomFigure>
      <EndingsList endings={db.endings} got={e.got} current={e.endKey} />
      <div class="end-actions">
        <button class="btn btn-primary" id="btn-poster" onclick={() => { game.posterOpen = true; }}>保存这一签</button>
        <button class="btn" id="btn-again" onclick={game.again}>再求一签</button>
      </div>
      <a class="about-link" href="/about/">关于这件作品</a>
    </div>
  </div>
</section>
