<script>
  // 卦画：六爻自下而上，一爻一笔墨。阳爻一整条，阴爻中间断开；变爻（老阳、老阴）旁边点一圈朱：〇是老阳，×是老阴。
  // 新写出来的那一爻带着笔意一笔写成（沿路径画出，不用滤镜）。lines 里是每一爻的数（6、7、8、9），自下而上，不满六爻时上面留出淡淡的空位。
  import { mulberry32 } from '../../core/rng.js';
  import { CN_YAO_SHORT, isYang, isMoving } from './yao.js';

  let { lines = [], size = 140, labels = true, marks = true, fresh = -1, seed = 7, label = '卦象' } = $props();

  const LH = 14; // 一爻的粗细
  const GAP = 10;
  const X0 = 8;
  const X1 = 100;
  const MID = [44, 64]; // 阴爻中间的缺口
  const yOf = (i) => 6 + (5 - i) * (LH + GAP) + LH / 2;

  // 一笔：在直线上加一点起伏，起笔略重、收笔略飘
  function stroke(x1, x2, y, rnd) {
    let d = `M${x1.toFixed(1)} ${(y + (rnd() - 0.5) * 1.6).toFixed(1)}`;
    const seg = Math.max(4, Math.round((x2 - x1) / 9));
    for (let k = 1; k <= seg; k++) {
      const x = x1 + ((x2 - x1) * k) / seg;
      d += ` L${x.toFixed(1)} ${(y + (rnd() - 0.5) * (k === seg ? 2.2 : 1.4)).toFixed(1)}`;
    }
    return d;
  }

  const drawn = $derived(lines.map((v, i) => {
    const rnd = mulberry32(seed * 131 + i * 977 + v * 31);
    const y = yOf(i);
    const parts = isYang(v) ? [[X0, X1]] : [[X0, MID[0]], [MID[1], X1]];
    return { i, v, y, moving: isMoving(v), yang: isYang(v), paths: parts.map(([a, b]) => ({ d: stroke(a, b, y, rnd), a, b })) };
  }));
  const ghosts = $derived(Array.from({ length: 6 - lines.length }, (_, k) => lines.length + k));
  const aria = $derived(`${label}，自下而上：${lines.map((v) => (isYang(v) ? '阳' : '阴') + (isMoving(v) ? '（变）' : '')).join('、') || '尚无'}`);
</script>

<svg class="hexagram" viewBox="-16 0 150 152" style:width={`${size}px`} role="img" aria-label={aria}>
  {#if labels}
    {#each CN_YAO_SHORT as ch, i}
      <text class="hx-label" x="-6" y={yOf(i) + 3.5} text-anchor="middle">{ch}</text>
    {/each}
  {/if}
  {#each ghosts as i}
    <line class="hx-ghost" x1={X0} x2={X1} y1={yOf(i)} y2={yOf(i)} />
  {/each}
  {#each drawn as ln (ln.i)}
    <g class="hx-line" class:is-new={ln.i === fresh} data-line={ln.i}>
      {#each ln.paths as p, k}
        <path class="hx-wet" d={p.d} pathLength="1" style:animation-delay={`${k * 0.28}s`} />
        <path class="hx-ink" d={p.d} pathLength="1" style:animation-delay={`${k * 0.28}s`} />
        <path class="hx-dry" d={stroke(p.a + 3, p.b - 3, ln.y - 1.5, mulberry32(ln.i * 17 + k))} pathLength="1" />
      {/each}
      {#if marks && ln.moving}
        {#if ln.yang}
          <circle class="hx-mark" cx="116" cy={ln.y} r="4.6" />
        {:else}
          <path class="hx-mark" d={`M111.4 ${ln.y - 4.6} L120.6 ${ln.y + 4.6} M120.6 ${ln.y - 4.6} L111.4 ${ln.y + 4.6}`} />
        {/if}
      {/if}
    </g>
  {/each}
</svg>

<style>
  .hexagram { display: block; height: auto; overflow: visible; }
  .hx-label { font-family: var(--f-text); font-size: 9px; fill: var(--gold-dim); }
  .hx-ghost { stroke: var(--gold); stroke-opacity: .12; stroke-width: 6; stroke-dasharray: 1 7; stroke-linecap: round; }
  .hx-ink { fill: none; stroke: var(--gold); stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 1; opacity: .9; }
  .hx-wet { fill: none; stroke: var(--gold); stroke-width: 13.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 1; opacity: .07; }
  .hx-dry { fill: none; stroke: var(--gan); stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: .13 .05 .3 .09; opacity: .5; }
  .hx-mark { fill: none; stroke: var(--cinnabar); stroke-width: 1.9; stroke-linecap: round; }
  .is-new .hx-ink, .is-new .hx-wet { animation: hx-write .8s cubic-bezier(.35, .1, .3, 1) both; }
  .is-new .hx-dry { animation: hx-fade .9s ease-out .5s both; }
  .is-new .hx-mark { animation: hx-fade .5s ease-out .8s both; }
  @keyframes hx-write { from { stroke-dashoffset: 1; } }
  @keyframes hx-fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .is-new .hx-ink, .is-new .hx-wet, .is-new .hx-dry, .is-new .hx-mark { animation: none; }
  }
</style>
