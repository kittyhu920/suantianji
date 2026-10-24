<script>
  // 掷筊请示：一对筊杯摆在桌上，三杯都由玩家亲手掷。圣杯同意，笑杯再掷，阴杯不同意；连得三个圣杯，这支签才算数。
  // 每一杯的结果记在桌上的三格里，过程记录写进命书。
  import { onMount } from 'svelte';
  import Spread from '../../core/Spread.svelte';
  import { trueRandom } from '../../core/rng.js';
  import { CUP_NAMES, CUP_LABELS } from './jiao.js';
  import { signNo } from './game.svelte.js';

  let { ctx, game } = $props();
  const { S } = game;
  const J = S.jiao;
  const blocks = [];
  const bodies = [];
  let throwBtn = $state();
  const rot = [0, 0];

  // 桌上的两块筊：把节点记下来（它们由 Codex 渲染）
  function cup(node, i) {
    blocks[i] = node;
    bodies[i] = node.querySelector('.jiao-body');
    return { destroy() { blocks[i] = bodies[i] = null; } };
  }

  // 两块筊在空中各自翻转、落地
  async function toss(res, dur = 1250) {
    blocks.forEach((c, i) => {
      const body = bodies[i];
      if (!c || !body) return;
      const face = res.flat[i] ? 0 : 180;
      const spins = 2 + Math.floor(trueRandom() * 3);
      rot[i] = Math.ceil(rot[i] / 360) * 360 + spins * 360 + face;
      body.style.transitionDuration = `${dur}ms`;
      c.style.animationDuration = `${dur}ms`;
      c.classList.remove('is-tossing');
      void c.offsetWidth;
      c.classList.add('is-tossing');
      body.style.transform = `rotateX(${rot[i]}deg)`;
      setTimeout(() => ctx.sfx.clack(0.9), ctx.reduced ? 0 : dur - 90 + i * 70);
    });
    await ctx.sleep(dur + 120);
    ctx.sfx.thud();
  }

  onMount(() => game.registerToss(toss));

  // 每次轮到玩家掷，焦点落在“掷筊”上
  $effect(() => {
    J.focus;
    if (J.mode === 'throw' && throwBtn) throwBtn.focus({ preventScroll: true });
  });

  const slot = (i) => S.cups[i] || (i === S.cups.length ? S.pending : null);
</script>

{#snippet desk()}
  <ul class="jiao-legend" aria-label="筊杯的规矩">
    <li><b>圣杯</b>一平一凸：神明同意</li>
    <li><b>笑杯</b>两面都平：没说清，再掷一次</li>
    <li class="is-yin"><b>阴杯</b>两面都凸：神明不同意</li>
    <li>连续三次圣杯，这支签才算数</li>
  </ul>
  <div class="jiao-pair">
    {#if S.sign}<p class="jiao-sign">{signNo(S.sign)}　{S.sign.name}</p>{/if}
    <div class="jiao" id="jiao" aria-hidden="true">
      {#each [0, 1] as i}
        <div class={`jiao-block${i ? ' is-right' : ''}`} use:cup={i}>
          <div class="jiao-body">
            <div class="jiao-face front"><svg viewBox="0 0 120 60"><use href="#jiao-ping"/></svg></div>
            <div class="jiao-face back"><svg viewBox="0 0 120 60"><use href="#jiao-tu"/></svg></div>
          </div>
        </div>
      {/each}
    </div>
    <div class="jiao-labels" id="jiao-labels" aria-hidden="true"><span>{J.labels[0]}</span><span>{J.labels[1]}</span></div>
  </div>
  <div class="jiao-tally">
    <ol class="cups" id="cups" aria-label="三杯">
      {#each [0, 1, 2] as i}
        {@const c = slot(i)}
        <li class={`cup ${S.cups[i] ? 'is-set' : c ? 'is-pending' : ''} ${c ? `is-${c.kind}` : ''}`}>
          <span class="cup-name">{CUP_LABELS[i]}</span><span class="cup-kind">{c ? CUP_NAMES[c.kind] : '　　'}</span>
        </li>
      {/each}
    </ol>
    <p class="jiao-result" id="jiao-result" aria-live="polite">
      {#if J.result}
        {CUP_LABELS[J.result.idx]}：{#if J.result.kind === 'sheng'}一平一凸，是圣杯：神明同意。{:else if J.result.kind === 'xiao'}两面都平，是笑杯：再掷一次。{:else}两面都凸，是<em>阴杯</em>：神明不同意。{/if}
      {/if}
    </p>
  </div>
{/snippet}

<Spread hint={J.note} {desk}>
  {#snippet foot()}
    {#if J.mode === 'choose'}
      <button class="btn btn-ghost" id="btn-reroll" disabled={J.busy} onclick={game.reroll}>{J.reroll}</button>
      <button class="btn btn-primary" id="btn-accept" disabled={J.busy} onclick={game.accept}>{J.accept}</button>
    {:else}
      <button class="btn btn-primary" id="btn-throw" bind:this={throwBtn} disabled={J.busy} onclick={game.playerThrow}>{J.again ? '再掷一次' : '掷筊'}</button>
    {/if}
  {/snippet}
</Spread>
