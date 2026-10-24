<script>
  // 灼与读兆：龟甲摆在书外的案上，背面预先凿好钻凿，按住一处来灼；“卜”的一声，兆就在书页上长出来。
  // 读兆时案收起，书占满整个案，兆图写在右页，读法写在左页。
  // 读完兆可以：王占曰（受兆 / 兆凶则改判）、再灼一处、或对贞——把同一件事反过来问一次。
  import Zhu from '../../core/Zhu.svelte';
  import Spread from '../../core/Spread.svelte';
  import Plastron from './Plastron.svelte';
  import OmenFigure from './OmenFigure.svelte';
  import { explain, isXiong, OMENS } from './omen.js';
  import { fanOf, cnNum } from './data.js';

  let { ctx, game } = $props();
  const { S } = game;
  let showFan = $state(false);
  let fanText = $state('');
  let away = $state(false); // 灼过之后，案收起（等“卜”的一声与烟散一会儿），书占满整个案

  const cur = $derived(S.cur >= 0 ? S.burns[S.cur] : null);
  const crack = $derived(cur ? game.crackOf(cur) : null);
  const fanB = $derived(S.burns.find((b) => b.kind === 'fan') ?? null);
  const zhengB = $derived(game.decisive());
  // 对贞时，另一半的兆也摆在甲上，两兆对照
  const otherB = $derived(cur ? (cur.kind === 'fan' ? zhengB : fanB) : null);
  const other = $derived(otherB && otherB !== cur ? game.crackOf(otherB) : null);
  const reading = $derived(S.phase === 'read');
  const ming = $derived(S.nextKind === 'fan' ? S.qFan : S.question);

  $effect(() => {
    if (!reading) { away = false; return; }
    const t = setTimeout(() => { away = true; }, ctx.reduced ? 0 : 900);
    return () => clearTimeout(t);
  });

  const pickNote = $derived(
    S.nextKind === 'fan' ? '这一灼是“对贞”：把同一件事反过来问。按住案上与第一灼左右对称的那一处。'
      : S.nextKind === 'again' ? '另选一处钻凿，再灼。火红了就别松手。'
        : '按住案上龟甲的一处钻凿，别松手；火红了，“卜”的一声就来。'
  );

  const hint = $derived(!reading ? pickNote
    : !S.grown ? '兆正在书页上裂开……'
      : showFan ? '把同一件事反过来问一次，改成你要问的话（也可以不改），再点“去灼”。'
        : zhengB && isXiong(zhengB.omen) ? '兆是凶的。你可以受下，也可以以王的身份，改判成吉。'
          : '读完这一兆，可以受兆，也可以再灼一处，或者对贞——把同一件事反过来问一次。');

  function openFan() {
    fanText = fanOf(S.question, S.domain);
    showFan = true;
  }
  function startFan() { showFan = false; game.startFan(fanText); }
</script>

{#snippet side()}
  {#if S.burns.length}
    <ol class="burn-chips" aria-label="已灼的兆">
      {#each S.burns as b, i}
        <li class:is-cur={i === S.cur && reading}><span>{cnNum(i + 1)}</span>{b.kind === 'fan' ? '对贞' : b.kind === 'again' ? '再灼' : '正问'} · {OMENS[b.omen].name}</li>
      {/each}
    </ol>
  {/if}

  {#if reading && S.grown && cur}
    {@const o = OMENS[cur.omen]}
    <div class="read" id="read">
      <p class="read-name" data-tone={o.tone}><small>兆曰</small><b>{#if o.name === '亡尤' || o.name === '有祟'}<Zhu term={o.name} />{:else}{o.name}{/if}</b></p>
      <p class="read-line">{o.line}</p>
      <p class="read-how">我是这样读的：{explain(crack.metrics)}。<Zhu term="兆干兆枝" />的形状决定<Zhu term="兆象" />，这套读法是我定的规矩。</p>
      <p class="read-hint">读完之后，由你来<Zhu term="王占曰" />：从兆，或者改判。</p>
      {#if cur.kind === 'fan' && zhengB}
        <p class="read-dui"><Zhu term="正反对贞" />：正问是<b>{OMENS[zhengB.omen].name}</b>，反问是<b>{o.name}</b>。{isXiong(zhengB.omen) === isXiong(cur.omen) ? '两边一个调子，哪边都说得通。' : '一正一反，两兆相应。'}</p>
      {/if}
      {#if showFan}
        <label class="ask fan-ask">
          <span class="ask-label">反过来问，你要问的是（可以改）</span>
          <input class="fan-input" type="text" maxlength="24" bind:value={fanText} autocomplete="off">
        </label>
      {/if}
    </div>
  {/if}
{/snippet}

<section class="screen screen-zhuo is-active" data-screen="zhuo" aria-labelledby="z-h">
  <h2 id="z-h" class="h-brush">{reading ? '读兆' : '灼'}</h2>
  <p class="ming-line" id="ming-line">贞：{ming}</p>
  {#if reading && crack}
    {#key S.cur}
      <OmenFigure {ctx} {crack} spot={cur.spot} {other} otherSpot={otherB?.spot} grow={reading} delay={1500} onDone={game.onGrown} />
    {/key}
  {:else}
    <p class="wait-line">龟甲在案上。按住一处钻凿，兆就裂在这一页上。</p>
  {/if}
  <div class="only-narrow zhuo-side">{@render side()}</div>
</section>

{#snippet desk()}
  <div class="zhuo-card">
    <div class="card">
      <Plastron {ctx} {game} />
    </div>
  </div>
{/snippet}

<Spread name={reading ? '读兆' : '灼'} sub="一灼一兆" {hint} left={side} record={reading} desk={reading && away ? undefined : desk}>
  {#snippet foot()}
    {#if reading && S.grown && cur}
      {#if showFan}
        <button class="btn btn-ghost" onclick={() => { showFan = false; }}>算了</button>
        <button class="btn btn-primary" id="btn-fan-go" onclick={startFan}>去灼</button>
      {:else}
        {#if game.spotsLeft() > 0}
          <button class="btn btn-ghost" id="btn-again" onclick={game.again}>不满意，再灼一处</button>
          {#if !fanB}<button class="btn btn-ghost" id="btn-dui" onclick={openFan}>对贞：反过来问</button>{/if}
        {/if}
        {#if zhengB && isXiong(zhengB.omen)}
          <button class="btn" id="btn-overrule" onclick={game.overrule}>王占曰：吉</button>
        {/if}
        <button class="btn btn-primary" id="btn-accept" onclick={game.accept}>王占曰：{zhengB && isXiong(zhengB.omen) ? '从兆' : '受兆'}</button>
      {/if}
    {/if}
  {/snippet}
</Spread>
