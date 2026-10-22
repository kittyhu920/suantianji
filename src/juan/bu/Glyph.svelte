<script>
  // 手绘的仿甲骨字形（glyphs.js）：墨色的粗细不匀的笔画。size 是高度（px）。
  import { GLYPHS } from './glyphs.js';

  let { ch, size = 64, label = true, class: cls = '' } = $props();
  const g = $derived(GLYPHS[ch]);
</script>

{#if g}
  <svg class={`bu-glyph ${cls}`.trim()} viewBox="0 0 48 64" height={size} width={size * 0.75} role="img" aria-label={`仿甲骨字形：${ch}`}>
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" filter="url(#bu-brush)">
      {#each g.d as d, i}
        <path {d} stroke-width={i === 0 ? 3.6 : 3} />
        <path {d} stroke-width="1.2" opacity=".5" transform="translate(.7 .5)" />
      {/each}
    </g>
  </svg>
{/if}
