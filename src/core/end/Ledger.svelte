<script>
  // 行为账本：刚才的每一步都记下了；每行旁边可以有一句大师的朱批。账本的细节只存在玩家自己的设备上；
  // 每局结束时另有一条匿名统计上报（stat.js），不含问题原文，隐私说明要与那里的字段保持一致。
  import Note from '../Note.svelte';
  let { rows = [] } = $props();
</script>

<section class="ledger" aria-labelledby="l-h">
  <h3 id="l-h">行为账本</h3>
  <p class="ledger-intro">刚才的每一步，我都记下了。下面那幅图，就是用这些织成的。账本里的细节只存在你自己的设备上。</p>
  <p class="ledger-intro">不过，每局结束时，我会匿名记一条统计：哪一卷、问的方向、结局、这一局的结果、用时的大致档次、有没有写问题、问题属于哪一类（只记类别，不记原文），还有昼夜主题。不记你的 IP，不用 cookie，也不会和这本账连起来。</p>
  <dl id="ledger">
    {#each rows as r}
      <dt>{r.k}</dt>
      <dd>{r.v}{#if r.note}<span class="zhupi"><Note text={r.note} /></span>{/if}</dd>
    {/each}
  </dl>
</section>
