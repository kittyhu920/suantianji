<script>
  // 刻辞：把前辞、命辞、占辞（有对贞时还有对贞辞）刻在甲上，一列一列。楷书，竖排，加刀刻的痕。
  import Zhu from '../../core/Zhu.svelte';
  import OmenFigure from './OmenFigure.svelte';

  let { ctx, game } = $props();
  const { S } = game;
  const z = game.decisive();
  const f = game.fanBurn();
  const crack = z && game.crackOf(z);
  const other = f && game.crackOf(f);
  const carve = $state.snapshot(game.carveData()) ?? null;
</script>

<section class="screen screen-ke is-active" data-screen="ke" aria-labelledby="k-h">
  <h2 id="k-h" class="h-brush">刻辞</h2>
  <p class="note">我作<Zhu term="贞人" />，把<Zhu term="前辞命辞占辞验辞">前辞、命辞、占辞</Zhu>刻在甲上，兆旁的数字是<Zhu term="兆序" />。{#if S.override}兆是凶的，刻下去的却是你改判的话。{/if}</p>
  {#if crack}
    <OmenFigure {ctx} {crack} {other} {carve} />
  {/if}
  <button class="btn btn-primary" id="btn-view" onclick={game.finish}>观象</button>
</section>
