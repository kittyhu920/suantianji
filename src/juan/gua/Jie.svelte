<script>
  // 解卦：桌上摆出本卦（与变卦）的卦画与卦辞。白话解读、所问方向的建议写进命书。可以受卦，也可以不认、再起一卦。
  import Spread from '../../core/Spread.svelte';
  import Hexagram from './Hexagram.svelte';
  import { afterChange } from './yao.js';

  let { ctx, game } = $props();
  const { S } = game;

  const cast = game.lastCast();
  const hex = cast.hex;
  const changed = cast.changed;
  const vs = cast.lines.map((l) => l.v);
  const n = S.casts.length;
  const earlier = S.casts.slice(0, -1).map((c) => c.hex.name);
  const recastLabel = n === 1 ? '不认这一卦，再起一卦' : `不认，再起第${'一二三四五六七八九'[n] ?? n + 1}卦`;
</script>

{#snippet desk()}
  <div class="jie-board">
    {#if earlier.length}<p class="jie-earlier">你已经起过：{earlier.join('、')}。这是第 {n} 卦。</p>{/if}
    <div class="jie-figs">
      <figure class="jie-fig">
        <Hexagram lines={vs} size={150} seed={n} label="本卦" />
        <figcaption>本卦 · <b>{hex.name}</b><small>{hex.lower}下{hex.upper}上</small></figcaption>
      </figure>
      {#if changed}
        <figure class="jie-fig">
          <Hexagram lines={afterChange(vs)} size={150} seed={n + 9} label="变卦" marks={false} />
          <figcaption>变卦 · <b>{changed.name}</b><small>{changed.lower}下{changed.upper}上</small></figcaption>
        </figure>
      {/if}
    </div>
    <p class="jiegua-ci"><b>卦辞</b>{hex.ci}</p>
  </div>
{/snippet}

<Spread hint="看过卦象与卦辞，可以“受卦”，也可以不认，再起一卦。白话解读与建议，我写进命书里。" {desk}>
  {#snippet foot()}
    <button class="btn btn-ghost" id="btn-recast" onclick={game.recast}>{recastLabel}</button>
    <button class="btn btn-primary" id="btn-accept" onclick={game.accept}>受卦</button>
  {/snippet}
</Spread>
