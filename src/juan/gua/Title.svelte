<script>
  // 卦卷入口：桌上摆着龟壳与三枚铜钱，书合着在里侧看着；点桌面下方朱红的“问”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  <figure class="idle-piece">
    {#if deskState.on}<div class="piece-slot is-gua" use:slot={{ id: 'gua', at: [0.5, 0.4] }}></div>{:else}<div class="idle-art"><Instrument id="gua" /></div>{/if}
    <figcaption>你起卦，我算你</figcaption>
  </figure>
{/snippet}

<Spread hint="点下面朱红的“问”字印开始。三枚铜钱，掷六回，约三分钟，建议打开声音。" {desk}>
  {#snippet act()}<Seal size="md" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal>{/snippet}
</Spread>
