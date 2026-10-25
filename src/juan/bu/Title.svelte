<script>
  // 卜卷入口：桌上摆着一块龟甲，书合着在里侧看着；点右下角朱红的“卜”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  <figure class="idle-piece">
    {#if deskState.on}<div class="piece-slot is-bu" use:slot={{ id: 'bu', at: [0.5, 0.4] }}></div>{:else}<div class="idle-art"><Instrument id="bu" /></div>{/if}
    <figcaption>你灼龟，我读兆</figcaption>
  </figure>
{/snippet}

<Spread hint="点右下角朱红的“卜”字印开始。三千多年前的殷墟，人们在甲骨上占卜；我替你备了一块龟腹甲，按住钻凿来灼，看裂出的兆。全程约三分钟，建议打开声音。" {desk}>
  {#snippet foot()}<Seal size="md" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>卜</Seal>{/snippet}
</Spread>
