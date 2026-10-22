<script>
  // 一行逐字洇开的文字：每个字带一点延迟（styles/base.css 的 .ink-ch）
  let { text, start = 0, step = 55 } = $props();
</script>

{#each [...text] as ch, i}<span class="ink-ch" style:animation-delay={start + i * step ? `${start + i * step}ms` : null}>{ch}</span>{/each}
