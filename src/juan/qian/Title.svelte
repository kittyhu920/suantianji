<script>
  // 签卷入口：标题墨痕、"问"字印章、通灵开关。首页的墨是活的：墨痕的边缘时时有一团淡墨在纸上洇开；
  // 偶尔下缘鼓起一颗墨珠，坠下，落在纸上洇成一小团。只在本屏、页面可见时。不画线（见 docs/DESIGN.md §8）。
  import { onMount } from 'svelte';
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import OracleToggle from '../../core/OracleToggle.svelte';

  let { ctx, game } = $props();
  let inkSvg;
  let block;

  const rand = (a, b) => a + Math.random() * (b - a);
  const cubic = (P, t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u ** 3 * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t ** 3 * P[3][k]);
  };
  // 墨痕轮廓上的几段贝塞尔（取自 img/title-ink.svg 的轮廓），坐标是 SVG 的 viewBox 坐标
  const EDGES = {
    top: [[-40, 190], [60, 150], [170, 100], [300, 76]],
    bottom: [[440, 150], [360, 152], [250, 178], [150, 232]],
    bottom2: [[150, 232], [50, 286], [10, 312], [-40, 330]],
  };
  // 取墨痕边缘上的一点，换算成墨画布里的坐标；落在画面之外就返回 null
  function inkEdgePoint(edge, lo = 0.08, hi = 0.92) {
    const m = inkSvg.getScreenCTM();
    if (!m) return null;
    const [x, y] = cubic(EDGES[edge], rand(lo, hi));
    const c = ctx.el.huaxin.getBoundingClientRect();
    const px = m.a * x + m.c * y + m.e - c.left;
    const py = m.b * x + m.d * y + m.f - c.top;
    return px > 24 && px < c.width - 24 && py > 0 && py < c.height ? { x: px, y: py } : null;
  }

  onMount(() => {
    if (ctx.reduced) return;
    let timer = 0;
    let nextBead = performance.now() + 5200;
    const tick = (first = false) => {
      timer = setTimeout(() => {
        if (!document.hidden) {
          const p = inkEdgePoint(['top', 'bottom', 'bottom', 'bottom2'][Math.floor(rand(0, 4))]);
          if (p) ctx.fx.wash(p.x, p.y, { R: rand(34, 56), a: 0.085, grow: 2.8, hold: 0.4, fade: 3 });
          if (performance.now() > nextBead) {
            nextBead = performance.now() + rand(7500, 11500);
            const q = inkEdgePoint('bottom', 0.3, 0.85);
            if (q) {
              const c = ctx.el.huaxin.getBoundingClientRect();
              const blockBottom = block.getBoundingClientRect().bottom - c.top;
              const land = Math.min(q.y + rand(80, 140), blockBottom + 6);
              if (land > q.y + 30) ctx.fx.fall(q.x, q.y - 3, land, { size: 1, hang: 1.6, onRelease: () => ctx.sfx.drip(0.04) });
            }
          }
        }
        tick();
      }, first ? 2300 : rand(1400, 2500));
    };
    tick(true);
    return () => clearTimeout(timer);
  });
</script>

<section class="screen screen-title is-active" data-screen="title" aria-labelledby="t-title">
  <div class="title-block" bind:this={block}>
    <img class="title-ink-img" src="/img/title-ink.svg" alt="" aria-hidden="true">
    <svg class="title-ink" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" bind:this={inkSvg}>
      <defs>
        <filter id="bleed" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="2" seed="5" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6"/>
        </filter>
      </defs>
      <g class="brush-spots" fill="var(--ink)" filter="url(#bleed)">
        <circle cx="330" cy="196" r="9"/><circle cx="350" cy="210" r="4"/><circle cx="314" cy="216" r="3"/><circle cx="46" cy="96" r="5"/>
      </g>
    </svg>
    <h1 id="t-title" class="title-main">演算天机</h1>
  </div>
  <p class="title-sub">你求签，我算你</p>
  <div class="title-actions">
    <OracleToggle desc={ctx.copy.oracleToggleDesc} />
    <p class="title-links">
      <a class="about-link" href="/qian/yuanliu/">签卷源流</a>
      <a class="about-link" href="/about/">关于这件作品</a>
    </p>
  </div>
</section>

<Spread name="签" sub="六十甲子签" hint="点右下角朱红的“问”字印开始。全程约两分钟，建议打开声音。">
  {#snippet foot()}<Seal size="md" id="btn-enter" aria-describedby="bot-hint" onclick={game.begin}>问</Seal>{/snippet}
</Spread>
