<script>
  // 定盘：按时辰报出现在的时间，选一个想问的方向，可以写下具体的问题。
  import Seal from '../../core/Seal.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Spread from '../../core/Spread.svelte';

  let { ctx, game } = $props();
  const { S, db } = game;
  let ask = $state('');

  const branch = game.branch();
  const from = (S.branchIdx * 2 + 23) % 24;
</script>

<section class="screen screen-ding is-active" data-screen="ding" aria-labelledby="d-h">
  <h2 id="d-h" class="h-brush">想问哪方面</h2>
  <p class="shichen" id="shichen">现在的<Zhu term="时辰" />是<b>{branch.zhi}时</b>（{from}–{(from + 2) % 24} 点），<Zhu term="五行" />属{branch.el}</p>
  <div class="slips" role="radiogroup" aria-label="问卜领域" id="slips">
    {#each Object.entries(db.domains) as [key, d]}
      <button class="slip" role="radio" aria-checked={S.domain === key} data-key={key} onclick={() => game.pickDomain(key)}>
        <span class="slip-name">{d.name}</span><span class="slip-desc">{d.desc.replaceAll(' · ', '　')}</span>
      </button>
    {/each}
  </div>
  <label class="ask">
    <span class="ask-label">写下你想问的具体问题（可以不写）</span>
    <input id="ask" type="text" maxlength="40" autocomplete="off" placeholder="例如：今年该不该换一份工作" bind:value={ask}>
  </label>
</section>

<Spread name="择域" sub="问哪一方面" hint={S.domain ? '选好了，点右下角的“定”。具体的问题可以不写。' : '先选一个想问的方向，再点右下角的“定”。具体的问题可以不写。'}>
  {#snippet foot()}<Seal size="md" id="btn-ding" disabled={!S.domain} aria-label="确定" onclick={() => game.confirmDing(ask)}>定</Seal>{/snippet}
</Spread>
