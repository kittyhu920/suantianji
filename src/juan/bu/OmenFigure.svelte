<script>
  // 兆图：龟甲正面（与背面是同一块甲，左右镜像），兆落在对应钻凿的位置（Canvas），兆旁刻着辞（楷书，竖排，加刀刻的效果）。
  //   crack / spot        正在生长的那一道兆，与它对应的钻凿序号
  //   other / otherSpot   对贞的另一半，总是长全的，可空
  //   carve               { xu, qian, ming[], zhan[], fanMing[], fanZhao[], fanXu, mainSpot, fanSpot } 刻辞；空则不刻
  //   grow                播放 crack 的生长
  import { onMount } from 'svelte';
  import { paintShell, paintCracks, carveLayout, spotPos, FIG_W, FIG_H } from './shell.js';

  let { ctx, crack, spot, other = null, otherSpot = null, carve = null, grow = false, delay = 0, onDone, class: cls = '' } = $props();
  const H = FIG_H;
  let box;
  let bg;
  let fg;
  let cw = 0;
  let t = 1;
  let raf = 0;
  let timer = 0;
  let done = false;
  let scale = $state(1);

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const pos = $derived(spotPos(spot));
  const opos = $derived(other && otherSpot != null ? spotPos(otherSpot) : null);

  function size() {
    cw = box.clientWidth;
    scale = cw / FIG_W;
    const d = dpr();
    for (const c of [bg, fg]) {
      c.width = Math.round(cw * d);
      c.height = Math.round(cw * (H / FIG_W) * d);
    }
  }

  function drawBg() {
    const g = bg.getContext('2d');
    const k = (cw / FIG_W) * dpr();
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, FIG_W, H);
    paintShell(g, { seed: crack.seed, bases: [pos, ...(opos ? [opos] : [])] });
  }

  function drawFg(glow) {
    const g = fg.getContext('2d');
    const k = (cw / FIG_W) * dpr();
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, FIG_W, H);
    paintCracks(g, [{ crack, spot, t }, other && { crack: other, spot: otherSpot, t: 1 }], { glow });
  }

  function draw(glow = false) { if (cw) { drawBg(); drawFg(glow); } }

  function play() {
    if (ctx.reduced) { t = 1; drawFg(false); finish(); return; }
    t = 0;
    const t0 = performance.now();
    const frame = (now) => {
      t = Math.min(1, (now - t0) / 2100);
      drawFg(true);
      if (t < 1) raf = requestAnimationFrame(frame);
      else { drawFg(false); finish(); }
    };
    drawFg(true);
    raf = requestAnimationFrame(frame);
  }
  function finish() { if (done) return; done = true; onDone?.(); }

  onMount(() => {
    size();
    t = grow ? 0 : 1;
    draw(false);
    const ro = new ResizeObserver(() => { if (box.clientWidth !== cw) { size(); draw(false); } });
    ro.observe(box);
    // 调试：面板隐藏时 rAF 暂停，可手动推进
    if (location.search.includes('debug')) window.__buFig = { set(v) { t = v; drawFg(true); if (v >= 1) finish(); } };
    return () => { ro.disconnect(); cancelAnimationFrame(raf); clearTimeout(timer); };
  });

  $effect(() => {
    if (!grow || !cw) return;
    clearTimeout(timer);
    t = 0;
    drawFg(false);
    timer = setTimeout(play, ctx.reduced ? 0 : delay);
    return () => clearTimeout(timer);
  });

  // 刻辞：每一列错开，一列一列刻下去（版面见 shell.js 的 carveLayout）
  const layout = $derived(carveLayout(carve));
  const xuPos = (p) => `left:calc(var(--u) * ${p.flip ? p.x + 18 : p.x - 36}px);top:calc(var(--u) * ${p.y - 22}px)`;
</script>

<div class={`omen-fig ${cls}`.trim()} bind:this={box} style={`--u:${scale};aspect-ratio:${FIG_W}/${H}`}>
  <canvas class="fig-bg" bind:this={bg} aria-hidden="true"></canvas>
  <canvas class="fig-crack" bind:this={fg} role="img" aria-label="灼出的兆纹"></canvas>
  {#if carve}
    {#if carve.xu}<span class="fig-xu" style={xuPos(pos)}>{carve.xu}</span>{/if}
    {#if opos && carve.fanXu}<span class="fig-xu" style={xuPos(opos)}>{carve.fanXu}</span>{/if}
    {#each layout as c}
      <p class={`kcol is-${c.k}`} style={`left:calc(var(--u) * ${c.x}px);top:calc(var(--u) * ${c.y}px);animation-delay:${(carve.base ?? 0) + c.n * 420}ms`}>{c.t}</p>
    {/each}
  {/if}
</div>
