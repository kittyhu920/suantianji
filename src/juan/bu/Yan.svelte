<script>
  // 验辞：下次再进卜卷时，大师问“上回你卜的事，验了没有”。回答记在本机，影响之后的书的话与坦白。
  // 上回的命辞写在桌上的一张纸笺上。
  import Spread from '../../core/Spread.svelte';
  import { YAN } from './data.js';
  import { OMENS } from './omen.js';

  let { ctx, game } = $props();
  const prev = game.lastVisit();
</script>

{#snippet desk()}
  <div class="ask-sheet paper yan-sheet">
    <p class="yan-h">验辞</p>
    <blockquote class="yan-quote">
      <p class="yan-q">贞：{prev.q}</p>
      <p class="yan-meta">{ctx.daysAgo(prev.at)}　兆{OMENS[prev.omen]?.name ?? '……'}　得“{prev.ending}”</p>
    </blockquote>
    <p class="ledger-intro">你的回答只存在你自己的设备上。我会记下它。</p>
  </div>
{/snippet}

<Spread hint="上回卜的事，验了没有？照实选一个，我会记下。" {desk}>
  {#snippet act()}
    {#each Object.entries(YAN) as [key, y]}
      <button class="btn btn-pair" id={`btn-yan-${key}`} onclick={() => game.answerYan(key)}>{y.label}</button>
    {/each}
  {/snippet}
</Spread>
