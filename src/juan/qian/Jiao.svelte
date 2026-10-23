<script>
  // 掷筊请示：三杯都由玩家亲手掷。圣杯同意，笑杯再掷，阴杯不同意；连得三个圣杯，这支签才算数。
  import { onMount } from 'svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Spread from '../../core/Spread.svelte';
  import { trueRandom } from '../../core/rng.js';
  import { CUP_NAMES, CUP_LABELS } from './jiao.js';

  let { ctx, game } = $props();
  const { S } = game;
  const J = S.jiao;
  let blocks = [];
  let bodies = [];
  let throwBtn = $state();
  const rot = [0, 0];

  // 两块筊在空中各自翻转、落地；落点各洇开一小团墨晕和水纹
  async function toss(res, dur = 1250) {
    blocks.forEach((c, i) => {
      const body = bodies[i];
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
    blocks.forEach((c) => {
      const p = ctx.fxPoint(c, 0.5, 0.7);
      ctx.fx.wash(p.x, p.y, { R: 34, a: 0.12, grow: 0.7, hold: 0.1, fade: 1.2 });
      ctx.fx.ripple(p.x, p.y, { r: 46, rings: 2, a: 0.18 });
    });
  }

  onMount(() => game.registerToss(toss));

  // 每次轮到玩家掷，焦点落在“掷筊”上
  $effect(() => {
    J.focus;
    if (J.mode === 'throw' && throwBtn) throwBtn.focus({ preventScroll: true });
  });

  const slot = (i) => S.cups[i] || (i === S.cups.length ? S.pending : null);
</script>

{#snippet legend()}
  <p class="jiao-rule"><Zhu term="筊杯" />是两块月牙形的木片，一面平、一面凸。</p>
  <ul class="jiao-legend">
    <li><b><Zhu term="圣杯" /></b>一平一凸：神明同意</li>
    <li><b><Zhu term="笑杯" /></b>两面都平：没说清，再掷一次</li>
    <li class="is-yin"><b><Zhu term="阴杯" /></b>两面都凸：神明不同意</li>
  </ul>
  <p class="jiao-rule"><Zhu term="三杯定签">连续三次都是圣杯</Zhu>，这支签才算数。</p>
{/snippet}

<section class="screen screen-jiao is-active" data-screen="jiao" aria-labelledby="j-h">
  <h2 id="j-h" class="h-brush"><Zhu term="掷筊" />请示</h2>
  <div class="only-narrow jiao-intro">{@render legend()}</div>
  <div class="jiao-play">
    <div class="jiao-board">
      <div class="jiao-pair">
        <div class="jiao" id="jiao" aria-hidden="true">
          {#each [0, 1] as i}
            <div class={`jiao-block${i ? ' is-right' : ''}`} bind:this={blocks[i]}>
              <div class="jiao-body" bind:this={bodies[i]}>
                <div class="jiao-face front"><svg viewBox="0 0 120 60"><use href="#jiao-ping"/></svg></div>
                <div class="jiao-face back"><svg viewBox="0 0 120 60"><use href="#jiao-tu"/></svg></div>
              </div>
            </div>
          {/each}
        </div>
        <div class="jiao-labels" id="jiao-labels" aria-hidden="true"><span>{J.labels[0]}</span><span>{J.labels[1]}</span></div>
      </div>
      <ol class="cups" id="cups" aria-label="三杯">
        {#each [0, 1, 2] as i}
          {@const cup = slot(i)}
          <li class={`cup ${S.cups[i] ? 'is-set' : cup ? 'is-pending' : ''} ${cup ? `is-${cup.kind}` : ''}`}>
            <span class="cup-tag">你来掷</span><span class="cup-name">{CUP_LABELS[i]}</span><span class="cup-kind">{cup ? CUP_NAMES[cup.kind] : '　　'}</span>
          </li>
        {/each}
      </ol>
    </div>
    <p class="jiao-result" id="jiao-result" aria-live="polite">
      {#if J.result}
        {CUP_LABELS[J.result.idx]}：{#if J.result.kind === 'sheng'}一平一凸，是圣杯：神明同意。{:else if J.result.kind === 'xiao'}两面都平，是笑杯：神明没说清，再掷一次。{:else}两面都凸，是<em>阴杯</em>：神明不同意这支签。{/if}
      {/if}
    </p>
  </div>
</section>

<Spread name="掷筊" sub="请神明示下" hint={J.note} left={legend}>
  {#snippet foot()}
    {#if J.mode === 'choose'}
      <button class="btn btn-ghost" id="btn-reroll" disabled={J.busy} onclick={game.reroll}>{J.reroll}</button>
      <button class="btn btn-primary" id="btn-accept" disabled={J.busy} onclick={game.accept}>{J.accept}</button>
    {:else}
      <button class="btn btn-primary" id="btn-throw" bind:this={throwBtn} disabled={J.busy} onclick={game.playerThrow}>{J.again ? '再掷一次' : '掷筊'}</button>
    {/if}
  {/snippet}
</Spread>
