<script>
  // 起卦：龟壳里三枚铜钱，摇动控制（docs/DESIGN.md §6）。连掷六次，爻自下而上一根根写出来，写满成卦。
  import { onMount } from 'svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Seal from '../../core/Seal.svelte';
  import Hexagram from './Hexagram.svelte';
  import { CN_YAO, YAO, faceText } from './yao.js';

  let { ctx, game } = $props();
  const { S, shake } = game;
  let svg;
  let button;
  let hexBox;

  onMount(() => {
    const off = game.attachShell(svg);
    const unbind = shake.bind(button);
    const offCast = game.registerCast({
      point: (i) => {
        const g = hexBox?.querySelector(`[data-line="${i}"]`);
        return g ? ctx.fxPoint(g, 0.5, 0.5) : null;
      },
    });
    return () => { unbind(); off(); offCast(); };
  });

  const n = $derived(S.cur.length);
  const last = $derived(S.cur[n - 1]);
  const noteNow = $derived(!shake.hasMotion
    ? '按住龟壳左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住龟壳左右拖着摇吧。'
      : '拿起手机晃一晃，铜钱会自己飞出来。也可以按住龟壳左右拖。');
  const note = $derived(n === 0 ? noteNow : n < 6 ? `第 ${n} 爻已成。再摇，掷第 ${n + 1} 爻。` : '');
  const heading = $derived(n < 6 ? `起卦 · ${CN_YAO[Math.min(n, 5)]}` : '卦成');
</script>

<section class="screen screen-cast is-active" data-screen="cast" aria-labelledby="c-h">
  <h2 id="c-h" class="h-brush">{heading}</h2>
  <p class="note" id="cast-note">{note}</p>
  {#if n === 0}<p class="cast-rule">每掷一次得一<Zhu term="爻" />，掷满六次成一卦。盛钱的是一只<Zhu term="龟壳" />，按<Zhu term="阴阳爻">阴阳</Zhu>记成 0 和 1。</p>{/if}
  <div class="cast-cols">
    <div class="shell-wrap" id="shell-wrap">
      <button class="tube shell" id="shell" bind:this={button} aria-label="龟壳：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
        <svg id="shell-svg" aria-hidden="true" bind:this={svg}></svg>
      </button>
    </div>
    <div class="cast-hex" bind:this={hexBox}>
      <Hexagram lines={S.cur.map((l) => l.v)} fresh={S.fresh} size={176} seed={S.casts.length + 1} label="这一卦" />
      {#if last}
        <p class="cast-line" id="cast-line" aria-live="polite">
          {CN_YAO[n - 1]}：{last.faces.map(faceText).join(' ')}，{YAO[last.v].faces}，<b>{YAO[last.v].name}</b>（{last.v}）{#if YAO[last.v].moving}，要变{/if}
        </p>
      {/if}
    </div>
  </div>
  <ul class="cast-legend">
    <li><b><Zhu term="老阳" /></b>三背 9：阳爻，要变</li>
    <li><b><Zhu term="少阴" /></b>两背一字 8：阴爻</li>
    <li><b><Zhu term="少阳" /></b>一背两字 7：阳爻</li>
    <li><b><Zhu term="老阴" /></b>三字 6：阴爻，要变</li>
  </ul>
  {#if S.result}
    {@const r = S.result}
    <div class="cast-done">
      <p class="cast-result" id="cast-result"><Zhu term="本卦" />：<b>{r.hex.name}</b>（<Zhu term="上卦下卦">{r.hex.lower}下{r.hex.upper}上</Zhu>）{#if r.changed}，<Zhu term="变卦" />：<b>{r.changed.name}</b>{:else}，没有<Zhu term="变爻" />{/if}</p>
      <Seal size="md" id="btn-jie" aria-label="解卦" onclick={game.toJie}>解</Seal>
    </div>
  {/if}
</section>
