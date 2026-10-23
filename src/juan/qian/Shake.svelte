<script>
  // 摇签：仿真签筒 + 摇动控制（docs/DESIGN.md §6）。签落地后，翻过一页，签卡在下一页上。
  import { onMount } from 'svelte';
  import InkLine from '../../core/InkLine.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Spread from '../../core/Spread.svelte';
  import { signNo } from './game.svelte.js';

  let { ctx, game } = $props();
  const { S, db, shake } = game;
  let svg;
  let button;

  onMount(() => {
    const off = game.attachTube(svg);
    const unbind = shake.bind(button);
    return () => { unbind(); off(); };
  });

  const noteNow = $derived(!shake.hasMotion
    ? '按住签筒左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住签筒左右拖着摇吧。'
      : '拿起手机晃一晃，签会自己跳出来。也可以按住签筒左右拖。');
  // 签一出筒，提示就不再变了；签卡出来后换成下一步的提示
  let frozen = $state('');
  $effect(() => { if (!S.sign) frozen = noteNow; });
  const note = $derived(S.signShown ? '签落下来了。点右下角的“掷筊请示”，问问神明这支签算不算数。' : (S.sign ? frozen : noteNow));
</script>

<section class="screen screen-qian is-active" data-screen="qian" aria-labelledby="q-h">
  {#if !S.signShown}<h2 id="q-h" class="h-brush">摇签</h2>{/if}
  <div class="tube-wrap" id="tube-wrap" hidden={S.signShown}>
    <button class="tube" id="tube" bind:this={button} aria-label="签筒：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
      <svg id="qian-svg" aria-hidden="true" bind:this={svg}></svg>
    </button>
  </div>
  {#if S.signShown && S.sign}
    {@const sign = S.sign}
    <article class="sign" id="sign" aria-labelledby="q-h">
      <h2 id="q-h" class="visually-hidden">得签</h2>
      <header class="sign-head">
        <p class="sign-no" id="sign-no">
          {#if sign.no}{signNo(sign)} · <Zhu term="六十甲子">{sign.gz}</Zhu> · <Zhu term="纳音">{sign.nayin}</Zhu>{:else}<Zhu term="签头" />{/if}
        </p>
        <h3 class="sign-name" id="sign-name">{sign.name}</h3>
        <p class="sign-level" id="sign-level" data-tone={db.levels[sign.level]}>{sign.level}</p>
      </header>
      <div class="poem" id="sign-poem">
        {#each sign.poem as line, i}<span><InkLine text={line} start={650 + i * [...line].length * 55} step={55} /></span>{/each}
      </div>
      <p class="sign-bai"><b>这支签在说什么</b><span id="sign-bai">{sign.bai}</span></p>
      <p class="sign-wait">按习俗，求到签后还要<Zhu term="掷筊" />，问问神明：这支签算不算数。</p>
    </article>
  {/if}
</section>

<Spread name={S.signShown ? '得签' : '摇签'} sub={S.signShown ? '一支签' : '签筒'} hint={note}>
  {#snippet foot()}
    {#if S.signShown && S.sign}<button class="btn btn-primary" id="btn-to-jiao" onclick={game.enterJiao}>掷筊请示</button>{/if}
  {/snippet}
</Spread>
