<script>
  // 四种结局：只揭示得到过的；没得到的连名字和触发方式都不说，留给下一次。
  let { endings, got, current } = $props();
  const all = $derived(Object.entries(endings));
  const count = $derived(all.filter(([k]) => got.includes(k)).length);
</script>

<section class="endings" aria-labelledby="en-h">
  <h3 id="en-h">结局 · 已得 {count} / {all.length}</h3>
  <ul id="endings-list">
    {#each all as [key, e]}
      {@const has = got.includes(key)}
      <li class={`${has ? '' : 'is-locked'} ${key === current ? 'is-current' : ''}`}>
        {#if has}
          <span class="seal" aria-hidden="true"><span>{e.name[0]}</span></span>
          <span><b>{e.name}·{e.sub}</b>{key === current ? '这一次' : '得到过'}</span>
        {:else}
          <span class="seal" aria-hidden="true"><span>?</span></span>
          <span><b>未得</b>还没有人告诉你</span>
        {/if}
      </li>
    {/each}
  </ul>
</section>
