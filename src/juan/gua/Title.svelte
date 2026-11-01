<script>
  // 卦卷入口：桌上摆着龟壳与三枚铜钱，书合着在里侧看着；点桌面下方朱红的“问”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  {#if deskState.on}<span class="slot-ghost" use:slot={{ id: 'gua', at3d: [-40, 19], s: 1.05 }}></span>{:else}<div class="idle-art is-corner"><Instrument id="gua" /></div>{/if}
{/snippet}

<Spread hero dim hint="点桌面正中朱红的“问”字印开始。三枚铜钱，掷六回，约三分钟，建议打开声音。" {desk}>
  {#snippet act()}<Seal size="xl" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal><p class="hero-line">你起卦，我算你</p>{/snippet}
</Spread>
