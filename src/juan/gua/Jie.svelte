<script>
  // 解卦：本卦（与变卦）的卦画、卦辞、白话解读、所问方向的建议。可以受卦，也可以不认、再起一卦。
  import Zhu from '../../core/Zhu.svelte';
  import InkLine from '../../core/InkLine.svelte';
  import Hexagram from './Hexagram.svelte';
  import { afterChange } from './yao.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  const cast = game.lastCast();
  const hex = cast.hex;
  const changed = cast.changed;
  const vs = cast.lines.map((l) => l.v);
  const domain = S.domain && db.domains[S.domain];
  const n = S.casts.length;
  const earlier = S.casts.slice(0, -1).map((c) => c.hex.name);
  const recastLabel = n === 1 ? '不认这一卦，再起一卦' : `不认，再起第${'一二三四五六七八九'[n] ?? n + 1}卦`;
</script>

<section class="screen screen-jie is-active" data-screen="jie" aria-labelledby="j-h">
  <h2 id="j-h" class="h-brush">解卦</h2>
  {#if earlier.length}<p class="jie-earlier">你已经起过：{earlier.join('、')}。这是第 {n} 卦。</p>{/if}
  <div class="jie-cols">
    <div class="jie-figs">
      <figure class="jie-fig">
        <Hexagram lines={vs} size={132} seed={n} label="本卦" />
        <figcaption><Zhu term="本卦" /> · <b>{hex.name}</b><small>{hex.lower}下{hex.upper}上</small></figcaption>
      </figure>
      {#if changed}
        <figure class="jie-fig">
          <Hexagram lines={afterChange(vs)} size={132} seed={n + 9} label="变卦" marks={false} />
          <figcaption><Zhu term="变卦" /> · <b>{changed.name}</b><small>{changed.lower}下{changed.upper}上</small></figcaption>
        </figure>
      {/if}
    </div>
    <article class="jiegua" aria-labelledby="jg-name">
      <h3 id="jg-name" class="jiegua-name">{hex.name}</h3>
      <p class="jiegua-ci"><b><Zhu term="卦辞" /></b><span><InkLine text={hex.ci} start={400} step={45} /></span></p>
      <p class="jq-row"><b>这一卦在说什么</b><span>{hex.bai}</span></p>
      {#if domain}<p class="jq-row"><b>关于{domain.desc}</b><span>{hex.advice[S.domain]}</span></p>{/if}
      {#if changed}
        <p class="jq-row"><b>变成{changed.name}</b><span>{changed.ci}　{changed.bai}</span></p>
      {:else}
        <p class="jq-row"><b>没有变爻</b><span>六爻都不动，只看这一卦，没有后来的样子。</span></p>
      {/if}
    </article>
  </div>
  <div class="jie-actions">
    <button class="btn btn-primary" id="btn-accept" onclick={game.accept}>受卦</button>
    <button class="btn btn-ghost" id="btn-recast" onclick={game.recast}>{recastLabel}</button>
  </div>
</section>
