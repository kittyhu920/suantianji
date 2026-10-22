<script>
  // 结局页里的"通灵解签"：可以请大师细说；等待时一滴墨落进纸里；回话后一段段写出来。
  import { createInk } from './ink.js';
  import { drip } from './audio.js';
  import { oracle } from './oracle.svelte.js';

  let { ctx, onAsk } = $props();
  const rand = (a, b) => a + Math.random() * (b - a);

  // 通灵等待：一滴墨落进纸里，化开，隔一会儿再一滴
  function well(canvas) {
    const w = createInk(canvas, { reduced: ctx.reduced });
    let dead = false;
    let timer = 0;
    const tick = () => {
      if (dead) return;
      const r = canvas.getBoundingClientRect();
      w.fall(r.width * rand(0.3, 0.7), -6, r.height * 0.5, { size: 0.9, onLand: () => drip(0.07) });
      timer = setTimeout(tick, rand(2300, 3200));
    };
    timer = setTimeout(tick, 300);
    return {
      destroy() { dead = true; clearTimeout(timer); setTimeout(() => w.destroy(), 3500); },
    };
  }

  const out = $derived(oracle.remaining === 0);
  const quota = $derived(oracle.remaining != null ? `（${oracle.remaining} / ${oracle.limit}）` : '');
</script>

{#if oracle.phase !== 'hidden'}
  <aside class="oracle" class:is-loading={oracle.phase === 'loading'} id="oracle">
    <h3>通灵解签</h3>
    {#if oracle.phase === 'offer'}
      <div class="oracle-ask">
        <p class="oracle-ask-note">还想听我用大白话细说？我会把你这支签、掷筊的结果，连同你写下的问题，送去云端请 AI 解一解。</p>
        <button class="btn btn-zhu-line" id="btn-oracle" disabled={out} onclick={onAsk}>请大师细说{quota}</button>
      </div>
    {:else if oracle.phase === 'loading'}
      <p id="oracle-text">大师正在细看你的签{#if ctx.reduced}<span class="ink-dots" aria-hidden="true"><i></i><i></i><i></i></span>{:else}<canvas class="ink-well" aria-hidden="true" use:well></canvas>{/if}</p>
    {:else}
      <p id="oracle-text">{oracle.text}</p>
    {/if}
  </aside>
{/if}
