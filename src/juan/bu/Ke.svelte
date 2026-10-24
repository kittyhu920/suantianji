<script>
  // 刻辞：把前辞、命辞、占辞（有对贞时还有对贞辞）刻在甲上，一列一列。楷书，竖排，加刀刻的痕。刻好的甲摆在桌上。
  import Spread from '../../core/Spread.svelte';
  import OmenFigure from './OmenFigure.svelte';

  let { ctx, game } = $props();
  const { S } = game;
  const z = game.decisive();
  const f = game.fanBurn();
  const crack = z && game.crackOf(z);
  const other = f && game.crackOf(f);
  const carve = $state.snapshot(game.carveData()) ?? null;
</script>

{#snippet desk()}
  {#if crack}
    <div class="zhuo-main">
      <OmenFigure {ctx} {crack} spot={z.spot} {other} otherSpot={f?.spot} {carve} />
    </div>
    <p class="ke-note">我作贞人，把前辞、命辞、占辞刻在甲上，兆旁的数字是兆序。{#if S.override}兆是凶的，刻下去的却是你改判的话。{/if}</p>
  {/if}
{/snippet}

<Spread hint="我把前辞、命辞、占辞刻在甲上。看完，点“观象”。" {desk}>
  {#snippet foot()}<button class="btn btn-primary" id="btn-view" onclick={game.finish}>观象</button>{/snippet}
</Spread>
