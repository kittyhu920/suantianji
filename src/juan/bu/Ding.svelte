<script>
  // 命辞：选一个方向，把想问的事说成一句话。命辞以“贞：”起头，刻在甲上。
  import Seal from '../../core/Seal.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import { DOMAINS, MAX_Q } from './data.js';

  let { ctx, game } = $props();
  const { S } = game;
  let ask = $state('');
  const shown = $derived(ask.trim() || (S.domain ? DOMAINS[S.domain].zheng : ''));
</script>

<section class="screen screen-ding is-active" data-screen="ding" aria-labelledby="d-h">
  <h2 id="d-h" class="h-brush">拟<Zhu term="命辞" /></h2>
  <p class="shichen">先选想问哪方面，再把要问的事说成一句话。卜用的多是龟甲，也有用<Zhu term="肩胛骨">牛的肩胛骨</Zhu>的。</p>
  <div class="slips" role="radiogroup" aria-label="问卜领域" id="slips">
    {#each Object.entries(DOMAINS) as [key, d]}
      <button class="slip" role="radio" aria-checked={S.domain === key} data-key={key} onclick={() => game.pickDomain(key)}>
        <span class="slip-name">{d.name}</span><span class="slip-desc">{d.desc.replaceAll(' · ', '　')}</span>
      </button>
    {/each}
  </div>
  <label class="ask">
    <span class="ask-label">写下你想问的事（可以不写，我替你拟）</span>
    <input id="ask" type="text" maxlength={MAX_Q} autocomplete="off" placeholder="例如：今年换一份工作" bind:value={ask}>
  </label>
  <p class="ming-preview" id="ming-preview" aria-live="polite">{#if shown}贞：{shown}{:else}　{/if}</p>
  <Seal size="md" id="btn-ding" disabled={!S.domain} aria-label="确定" onclick={() => game.confirmDing(ask)}>定</Seal>
</section>
