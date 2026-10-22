<script>
  // 结局页里的通灵框（标题与说明由卷的 copy 提供）：可以请大师细说；等待时一滴墨落进纸里；回话后一段段写出来。
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
    <h3>{ctx.copy.oracleTitle}</h3>
    {#if oracle.phase === 'offer'}
      <div class="oracle-ask">
        <p class="oracle-ask-note">{ctx.copy.oracleAsk}</p>
        <button class="btn btn-zhu-line" id="btn-oracle" disabled={out} onclick={onAsk}>{ctx.copy.oracleButton}{quota}</button>
      </div>
    {:else if oracle.phase === 'loading'}
      <p id="oracle-text">{ctx.copy.oracleWait}{#if ctx.reduced}<span class="ink-dots" aria-hidden="true"><i></i><i></i><i></i></span>{:else}<canvas class="ink-well" aria-hidden="true" use:well></canvas>{/if}</p>
    {:else}
      <p id="oracle-text">{oracle.text}</p>
    {/if}
  </aside>
{/if}
