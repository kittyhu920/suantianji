<script>
  // 行为账本：刚才的每一步都记下了；每行旁边可以有一句大师的朱批。只存在玩家自己的设备上。
  let { rows = [] } = $props();
</script>

<section class="ledger" aria-labelledby="l-h">
  <h3 id="l-h">行为账本</h3>
  <p class="ledger-intro">刚才的每一步，我都记下了。下面那幅图，就是用这些织成的。这些记录只存在你自己的设备上。</p>
  <dl id="ledger">
    {#each rows as r}
      <dt>{r.k}</dt>
      <dd>{r.v}{#if r.note}<span class="zhupi">{r.note}</span>{/if}</dd>
    {/each}
  </dl>
</section>
