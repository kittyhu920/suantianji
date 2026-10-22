<script>
  // 命盘：由这一局的行为数据织成的锦（loom.js）。图例由各卷自己写，放在 children 里。
  import { onMount } from 'svelte';
  import { weave } from '../loom.js';

  let { ctx, seed, throws, caption, children } = $props();
  let canvas;
  onMount(() => { weave(canvas, { seed, throws, reduced: ctx.reduced }); });
</script>

<figure class="loom">
  <canvas id="loom" bind:this={canvas} role="img" aria-label="由你的行为数据织成的命盘"></canvas>
  <figcaption id="loom-cap">{caption}</figcaption>
  {@render children?.()}
</figure>
