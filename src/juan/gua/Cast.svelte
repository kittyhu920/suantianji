<script>
  // 起卦：龟壳里三枚铜钱摆在桌上，摇动控制（docs/DESIGN.md §6）。连掷六次，爻自下而上一根根画在龟壳旁的卦画上，写满成卦。
  import Spread from '../../core/Spread.svelte';
  import Seal from '../../core/Seal.svelte';
  import Hexagram from './Hexagram.svelte';
  import { CN_YAO, YAO, faceText } from './yao.js';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
  const { S, shake } = game;

  // 龟壳在桌上，由 Codex 渲染：用动作把龟壳与摇动控制接上
  function rig(button) {
    const piece = deskState.on ? deskRef.pieces?.list.gua : null;
    const svg = button.querySelector('svg') ?? document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const off = game.attachShell(svg, piece?.view);
    const unbind = shake.bind(button);
    if (piece) piece.proxy = () => button;
    return { destroy() { unbind(); off(); if (piece) piece.proxy = null; } };
  }

  const n = $derived(S.cur.length);
  const last = $derived(S.cur[n - 1]);
  const noteNow = $derived(!shake.hasMotion
    ? '按住桌上的龟壳左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住龟壳左右拖着摇吧。'
      : '拿起手机晃一晃，铜钱会自己飞出来。也可以按住龟壳左右拖。');
  const note = $derived(S.result ? '卦成了。点右下角的“解”，看这一卦怎么说。' : n === 0 ? noteNow : `第 ${n} 爻已画在卦画上。再摇，掷第 ${n + 1} 爻。`);
</script>

{#snippet desk()}
  <ul class="cast-legend" aria-label="一爻的算法">
    <li><b>老阳</b>三背 9：阳爻，要变</li>
    <li><b>少阴</b>两背一字 8：阴爻</li>
    <li><b>少阳</b>一背两字 7：阳爻</li>
    <li><b>老阴</b>三字 6：阴爻，要变</li>
  </ul>
  {#if deskState.on}
    <div class="piece-slot is-gua" id="shell-wrap" use:slot={{ id: 'gua', at: [0.5, 0.2] }}>
      <button class="tube kegui proxy" id="shell" use:rig aria-label="龟壳：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃"></button>
    </div>
  {:else}
    <div class="shell-wrap" id="shell-wrap">
      <button class="tube kegui" id="shell" use:rig aria-label="龟壳：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
        <svg id="shell-svg" aria-hidden="true"></svg>
      </button>
    </div>
  {/if}
  <div class="cast-hex">
    <Hexagram lines={S.cur.map((l) => l.v)} fresh={S.fresh} size={158} seed={S.casts.length + 1} label="这一卦" />
    {#if last}
      <p class="cast-line" id="cast-line" aria-live="polite">
        {CN_YAO[n - 1]}：{last.faces.map(faceText).join(' ')}，{YAO[last.v].faces}，<b>{YAO[last.v].name}</b>（{last.v}）{#if YAO[last.v].moving}，要变{/if}
      </p>
    {/if}
    {#if S.result}
      {@const r = S.result}
      <p class="cast-result" id="cast-result">本卦：<b>{r.hex.name}</b>（{r.hex.lower}下{r.hex.upper}上）{#if r.changed}，变卦：<b>{r.changed.name}</b>{:else}，没有变爻{/if}</p>
    {/if}
  </div>
{/snippet}

<Spread hint={note} {desk}>
  {#snippet foot()}
    {#if S.result}<Seal size="md" id="btn-jie" aria-label="解卦" onclick={game.toJie}>解</Seal>{/if}
  {/snippet}
</Spread>
