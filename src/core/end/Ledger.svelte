<script>
  // 行为账本：刚才的每一步都记下了；每行旁边可以有一句大师的朱批。账本的细节只存在玩家自己的设备上；
  // 每局结束时另有一条匿名统计上报（stat.js），不含问题原文，隐私说明要与那里的字段保持一致。
  // part：账本太长，一页放不下时拆成两页——'a' 是标题、说明与前半，'b' 是后半，不写就是整本。
  import Note from '../Note.svelte';
  let { rows = [], part = 'all' } = $props();
  const cut = 5; // 前半放在有说明的那一页，后半独占一页
  const shown = $derived(part === 'a' ? rows.slice(0, cut) : part === 'b' ? rows.slice(cut) : rows);
</script>

{#snippet privacy()}
  <p class="ledger-intro">不过，每局结束时，我会匿名记一条统计：哪一卷、问的方向、结局、这一局的结果、用时的大致档次、有没有写问题、问题属于哪一类（只记类别，不记原文），还有昼夜主题。不记你的 IP，不用 cookie，也不会和这本账连起来。</p>
{/snippet}

<section class="ledger" aria-labelledby={part === 'b' ? undefined : 'l-h'}>
  {#if part !== 'b'}
    <h3 id="l-h">行为账本</h3>
    <p class="ledger-intro">刚才的每一步，我都记下了。后面那幅图，就是用这些织成的。账本里的细节只存在你自己的设备上。</p>
    {#if part === 'all'}{@render privacy()}{/if}
  {/if}
  <dl id={part === 'b' ? undefined : 'ledger'}>
    {#each shown as r}
      <dt>{r.k}</dt>
      <dd>{r.v}{#if r.note}<span class="zhupi"><Note text={r.note} /></span>{/if}</dd>
    {/each}
  </dl>
  {#if part === 'b'}{@render privacy()}{/if}
</section>
