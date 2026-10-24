<script>
  // 卦卷入口：桌上摆着龟壳与三枚铜钱，书合着在里侧看着；点右下角朱红的“问”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  <figure class="idle-piece">
    <div class="idle-art"><Instrument id="gua" /></div>
    <figcaption>你起卦，我算你</figcaption>
  </figure>
{/snippet}

<Spread hint="点右下角朱红的“问”字印开始。三枚铜钱，掷六回，约三分钟，建议打开声音。" {desk}>
  {#snippet foot()}<Seal size="md" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal>{/snippet}
</Spread>
