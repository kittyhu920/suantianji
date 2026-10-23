<script>
  // 验辞：下次再进卜卷时，大师问“上回你卜的事，验了没有”。回答记在本机，影响之后的眉批与坦白。
  import Zhu from '../../core/Zhu.svelte';
  import Spread from '../../core/Spread.svelte';
  import { YAN } from './data.js';
  import { OMENS } from './omen.js';

  let { ctx, game } = $props();
  const prev = game.lastVisit();
</script>

<section class="screen screen-yan is-active" data-screen="yan" aria-labelledby="y-h">
  <h2 id="y-h" class="h-brush"><Zhu term="验辞" /></h2>
  <blockquote class="yan-quote">
    <p class="yan-q">贞：{prev.q}</p>
    <p class="yan-meta">{ctx.daysAgo(prev.at)}　兆{OMENS[prev.omen]?.name ?? '……'}　得“{prev.ending}”</p>
  </blockquote>
  <p class="ledger-intro">你的回答只存在你自己的设备上。我会记下它。</p>
</section>

<Spread name="验辞" sub="上回的事" hint="上回卜的事，验了没有？照实选一个，我会记下。">
  {#snippet foot()}
    {#each Object.entries(YAN) as [key, y]}
      <button class="btn" class:btn-primary={key === 'yan'} id={`btn-yan-${key}`} onclick={() => game.answerYan(key)}>{y.label}</button>
    {/each}
  {/snippet}
</Spread>
