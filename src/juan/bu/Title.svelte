<script>
  // 卜卷入口：桌上摆着一块龟甲，书合着在里侧看着；点桌面下方朱红的“卜”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  {#if deskState.on}<span class="slot-ghost" use:slot={{ id: 'bu', at3d: [-38, 18], s: 1.15 }}></span>{:else}<div class="idle-art is-corner"><Instrument id="bu" /></div>{/if}
{/snippet}

<Spread hero dim hint="点桌面正中朱红的“卜”字印开始。三千多年前的殷墟，人们在甲骨上占卜；我替你备了一块龟腹甲，按住钻凿来灼，看裂出的兆。全程约三分钟，建议打开声音。" {desk}>
  {#snippet act()}<Seal size="xl" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>卜</Seal><p class="hero-line">你灼龟，我读兆</p>{/snippet}
</Spread>
