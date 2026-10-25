<script>
  // 签卷入口：桌上摆着签筒，书合着在里侧看着；点右下角朱红的“问”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  <figure class="idle-piece">
    {#if deskState.on}<div class="piece-slot is-qian" use:slot={{ id: 'qian', at: [0.5, 0.5] }}></div>{:else}<div class="idle-art"><Instrument id="qian" /></div>{/if}
    <figcaption>你求签，我算你</figcaption>
  </figure>
{/snippet}

<Spread hint="点右下角朱红的“问”字印开始。全程约两分钟，建议打开声音。通灵开关、源流与关于，在上面的天头栏里。" {desk}>
  {#snippet foot()}<Seal size="md" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal>{/snippet}
</Spread>
