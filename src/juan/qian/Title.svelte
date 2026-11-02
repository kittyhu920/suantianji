<script>
  // 签卷入口：桌上摆着签筒，书合着在里侧看着；点桌面下方朱红的“问”字印开始。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Instrument from '../../core/desk/Instrument.svelte';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
</script>

{#snippet desk()}
  <!-- 入口：桌面正中是朱印“问”（焦点），签筒退到左下角（at3d），四周压暗 -->
  {#if deskState.on}<span class="slot-ghost" use:slot={{ id: 'qian', at3d: [-40, 21], s: 0.95 }}></span>{:else}<div class="idle-art is-corner"><Instrument id="qian" /></div>{/if}
{/snippet}

<Spread hero dim hint="点桌面正中朱红的“问”字印开始。全程约两分钟，建议打开声音。通灵开关、源流与关于，在上面的天头栏里。" {desk}>
  {#snippet act()}<Seal size="xl" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal><p class="hero-line">你求签，我算你</p>{/snippet}
</Spread>
