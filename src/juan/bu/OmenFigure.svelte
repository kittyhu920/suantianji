<script>
  // 兆图：一块甲片，上面是灼出的兆（Canvas），兆旁刻着辞（楷书，竖排，加刀刻的效果）。
  // 正问的兆在中缝右边，反问（对贞）的在左边，对称。生长动画在 grow 变真之后播出。
  //   crack         正在生长的那一道兆（makeCrack 的返回值）；side 为 'main' 时在中缝右边，'fan' 时在左边
  //   other         另一边的兆（对贞的另一半），总是长全的，可空
  //   carve         { xu, qian, ming[], zhan[], fanMing[], fanZhao[], fanXu } 刻辞；空则不刻
  //   grow          播放 crack 的生长（只播 crack，fan 总是长全的）
  //   compact       矮的一块，只放兆（读兆时用）
  import { onMount } from 'svelte';
  import { paintShell, paintCrackPair, carveLayout, FIG_W, FIG_H, BASE_Y, BASE_X } from './shell.js';

  let { ctx, crack, side = 'main', other = null, carve = null, grow = false, delay = 0, compact = false, onDone, class: cls = '' } = $props();
  const fan = $derived(side === 'main' ? other : crack); // 左边那一道
  const main = $derived(side === 'main' ? crack : other); // 右边那一道
  const H = compact ? FIG_H.compact : FIG_H.full;
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
    paintShell(g, H, {
      seed: crack.seed,
      bases: [...(main ? [{ x: BASE_X.main, y: BASE_Y, flip: true }] : []), ...(fan ? [{ x: BASE_X.fan, y: BASE_Y, flip: false }] : [])],
    });
  }

  function drawFg(glow) {
    const g = fg.getContext('2d');
    const k = (cw / FIG_W) * dpr();
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, FIG_W, H);
    paintCrackPair(g, {
      main: main && { crack: main, t: side === 'main' ? t : 1 },
      fan: fan && { crack: fan, t: side === 'fan' ? t : 1 },
    }, { glow });
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
  const layout = $derived(carveLayout(carve, !!fan));
</script>

<div class={`omen-fig ${compact ? 'is-compact' : ''} ${cls}`.trim()} bind:this={box} style={`--u:${scale};aspect-ratio:${FIG_W}/${H}`}>
  <canvas class="fig-bg" bind:this={bg} aria-hidden="true"></canvas>
  <canvas class="fig-crack" bind:this={fg} role="img" aria-label="灼出的兆纹"></canvas>
  {#if carve}
    {#if carve.xu}<span class="fig-xu" style={`left:calc(var(--u) * ${BASE_X.main + 18}px);top:calc(var(--u) * ${BASE_Y - 22}px)`}>{carve.xu}</span>{/if}
    {#if fan && carve.fanXu}<span class="fig-xu" style={`left:calc(var(--u) * ${BASE_X.fan - 36}px);top:calc(var(--u) * ${BASE_Y - 22}px)`}>{carve.fanXu}</span>{/if}
    {#each layout as c}
      <p class={`kcol is-${c.k}`} style={`left:calc(var(--u) * ${c.x}px);top:calc(var(--u) * ${c.y}px);animation-delay:${(carve.base ?? 0) + c.n * 420}ms`}>{c.t}</p>
    {/each}
  {/if}
</div>
