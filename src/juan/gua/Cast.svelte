<script>
  // 起卦：龟壳里三枚铜钱摆在书外的案上，摇动控制（docs/DESIGN.md §6）。连掷六次，爻自下而上一根根写在书页上，写满成卦。
  import Zhu from '../../core/Zhu.svelte';
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import Hexagram from './Hexagram.svelte';
  import { CN_YAO, YAO, faceText } from './yao.js';

  let { ctx, game } = $props();
  const { S, shake } = game;
  let hexBox;

  // 龟壳在案上，由 Codex 渲染：用动作把龟壳、摇动控制和“爻写在哪里”接上
  function rig(button) {
    const svg = button.querySelector('svg');
    const off = game.attachShell(svg);
    const unbind = shake.bind(button);
    const offCast = game.registerCast({
      point: (i) => {
        const g = hexBox?.querySelector(`[data-line="${i}"]`);
        return g ? ctx.fxPoint(g, 0.5, 0.5) : null;
      },
    });
    return { destroy() { unbind(); off(); offCast(); } };
  }

  const n = $derived(S.cur.length);
  const last = $derived(S.cur[n - 1]);
  const noteNow = $derived(!shake.hasMotion
    ? '按住案上的龟壳左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住龟壳左右拖着摇吧。'
      : '拿起手机晃一晃，铜钱会自己飞出来。也可以按住龟壳左右拖。');
  const note = $derived(S.result ? '卦成了。点右下角的“解”，看这一卦怎么说。' : n === 0 ? noteNow : `第 ${n} 爻已写在书上。再摇，掷第 ${n + 1} 爻。`);
  const heading = $derived(n < 6 ? `起卦 · ${CN_YAO[Math.min(n, 5)]}` : '卦成');
</script>

{#snippet rules()}
  <p class="cast-rule">每掷一次得一<Zhu term="爻" />，掷满六次成一卦。盛钱的是一只<Zhu term="龟壳" />，按<Zhu term="阴阳爻">阴阳</Zhu>记成 0 和 1。</p>
  <ul class="cast-legend">
    <li><b><Zhu term="老阳" /></b>三背 9：阳爻，要变</li>
    <li><b><Zhu term="少阴" /></b>两背一字 8：阴爻</li>
    <li><b><Zhu term="少阳" /></b>一背两字 7：阳爻</li>
    <li><b><Zhu term="老阴" /></b>三字 6：阴爻，要变</li>
  </ul>
{/snippet}

<section class="screen screen-cast is-active" data-screen="cast" aria-labelledby="c-h">
  <h2 id="c-h" class="h-brush">{heading}</h2>
  <div class="cast-cols">
    <div class="cast-hex" bind:this={hexBox}>
      <Hexagram lines={S.cur.map((l) => l.v)} fresh={S.fresh} size={168} seed={S.casts.length + 1} label="这一卦" />
      {#if last}
        <p class="cast-line" id="cast-line" aria-live="polite">
          {CN_YAO[n - 1]}：{last.faces.map(faceText).join(' ')}，{YAO[last.v].faces}，<b>{YAO[last.v].name}</b>（{last.v}）{#if YAO[last.v].moving}，要变{/if}
        </p>
      {/if}
    </div>
  </div>
  <div class="only-narrow cast-notes">{@render rules()}</div>
  {#if S.result}
    {@const r = S.result}
    <div class="cast-done">
      <p class="cast-result" id="cast-result"><Zhu term="本卦" />：<b>{r.hex.name}</b>（<Zhu term="上卦下卦">{r.hex.lower}下{r.hex.upper}上</Zhu>）{#if r.changed}，<Zhu term="变卦" />：<b>{r.changed.name}</b>{:else}，没有<Zhu term="变爻" />{/if}</p>
    </div>
  {/if}
</section>

{#snippet desk()}
  <div class="shell-wrap" id="shell-wrap">
    <button class="tube kegui" id="shell" use:rig aria-label="龟壳：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
      <svg id="shell-svg" aria-hidden="true"></svg>
    </button>
  </div>
{/snippet}

<Spread name="起卦" sub={heading} hint={note} left={rules} desk={desk}>
  {#snippet foot()}
    {#if S.result}<Seal size="md" id="btn-jie" aria-label="解卦" onclick={game.toJie}>解</Seal>{/if}
  {/snippet}
</Spread>
