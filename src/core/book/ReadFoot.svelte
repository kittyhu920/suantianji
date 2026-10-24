<script>
  // 读命书时页脚的按钮：合上（回书桌）、再来一次、请大师细说（通灵，只有接通灵的卷）、保存这一签/卦/卜（分享图，主按钮朱印）。
  import { navigate } from 'astro:transitions/client';
  import { oracle } from '../oracle.svelte.js';

  // again：再来一次的字；onagain：再来一次做什么（卜卷里 game.again 是“再灼一处”，要传 game.playAgain）
  let { ctx, game, again, onagain = game.again, save } = $props();
  const out = $derived(oracle.remaining === 0);
  const quota = $derived(oracle.remaining != null ? `（${oracle.remaining} / ${oracle.limit}）` : '');
</script>

<button class="btn btn-ghost" id="btn-close" onclick={() => navigate('/')}>合上</button>
<button class="btn btn-ghost" id="btn-again" onclick={onagain}>{again}</button>
{#if oracle.phase === 'offer' && ctx.copy.oracleButton}
  <button class="btn btn-ghost" id="btn-oracle" disabled={out} onclick={game.askOracle}>{ctx.copy.oracleButton}{quota}</button>
{:else if oracle.phase === 'loading'}
  <span class="oracle-wait" id="oracle-wait">{ctx.copy.oracleWait}……</span>
{/if}
{#if game.makePoster}
  <button class="btn btn-primary" id="btn-poster" onclick={() => game.openPoster()}>{save}</button>
{/if}
