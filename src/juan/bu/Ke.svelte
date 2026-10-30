<script>
  // 刻辞：把前辞、命辞、占辞（有对贞时还有对贞辞）刻在甲上，一列一列。楷书，竖排，加刀刻的痕。刻好的甲摆在桌上。
  import Spread from '../../core/Spread.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import OmenFigure from './OmenFigure.svelte';
  import { onMount } from 'svelte';
  import { deskState, deskRef } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
  const { S } = game;
  const z = game.decisive();
  const f = game.fanBurn();
  const crack = z && game.crackOf(z);
  const other = f && game.crackOf(f);
  const carve = $state.snapshot(game.carveData()) ?? null;
  // 3D 书桌下，刻好辞的甲是 DOM 里的兆图（摆在桌上）：桌上那块 3D 的龟甲收起，免得两块甲叠在一起
  onMount(() => { if (deskState.on) deskRef.pieces?.hide('bu'); });
</script>

{#snippet desk()}
  {#if crack}
    <div class="zhuo-main">
      <OmenFigure {ctx} {crack} spot={z.spot} {other} otherSpot={f?.spot} {carve} />
    </div>
    <p class="ke-note">我作<Zhu term="贞人" />，把<Zhu term="前辞" />、<Zhu term="命辞" />、<Zhu term="占辞" />刻在甲上，兆旁的数字是<Zhu term="兆序" />。{#if S.override}兆是凶的，刻下去的却是你改判的话。{/if}</p>
  {/if}
{/snippet}

<Spread hint="我把前辞、命辞、占辞刻在甲上。看完，点“观象”。" {desk}>
  {#snippet act()}<button class="btn btn-primary" id="btn-view" onclick={game.finish}>观象</button>{/snippet}
</Spread>
