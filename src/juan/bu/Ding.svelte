<script>
  // 命辞：三支木牌摆在桌上，选一支定下方向；把想问的事说成一句话，写在桌上的纸笺上。命辞以“贞：”起头，刻在甲上。
  // 写完点“定”，字被纸吸进去，书再开口回一句。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';
  import { DOMAINS, MAX_Q } from './data.js';

  let { ctx, game } = $props();
  const { S } = game;
  let ask = $state('');
  let soak = $state(false);
  const shown = $derived(ask.trim() || (S.domain ? DOMAINS[S.domain].zheng : ''));
  const dom = $derived(S.domain ? DOMAINS[S.domain] : null);

  function confirm() {
    if (soak || !S.domain) return;
    ask = ask.trim();
    soak = true;
    game.confirmDing(ask);
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirm(); }
  }
</script>

{#snippet desk()}
  <div class="slips" role="radiogroup" aria-label="问卜领域" id="slips">
    {#each Object.entries(DOMAINS) as [key, d]}
      <button class="slip" role="radio" aria-checked={S.domain === key} data-key={key} disabled={soak} onclick={() => game.pickDomain(key)}>
        <span class="slip-name">{d.name}</span><span class="slip-desc">{d.desc.replaceAll(' · ', '　')}</span>
      </button>
    {/each}
  </div>
  <div class="ask-sheet paper">
    <p class="shichen">卜用的多是龟甲，也有用牛的肩胛骨的。</p>
    <p class="ask-domain" id="ask-domain">{#if dom}所问之事：<b>{dom.name}</b>{dom.desc.replaceAll(' · ', '　')}{:else}先取一块木牌，定下想问的方向。{/if}</p>
    {#if soak}
      <p class="ask-written is-soak" id="ask-written">{ask || '（没有写下具体的事，我替你拟）'}</p>
    {:else}
      <label>
        <span class="ask-label">把要问的事说成一句话，写在纸上（可以不写，我替你拟）</span>
        <textarea class="ask-paper" id="ask" rows="2" maxlength={MAX_Q} autocomplete="off" spellcheck="false" placeholder="例如：今年换一份工作" bind:value={ask} onkeydown={onKey}></textarea>
      </label>
    {/if}
    <p class="ming-preview" id="ming-preview" aria-live="polite">{#if shown}贞：{shown}{:else}　{/if}</p>
  </div>
{/snippet}

<Spread hint={soak ? '字被纸吸进去了。' : S.domain ? '选好了，点右下角的“定”。不写，我替你拟。' : '先在桌上选一块木牌，再点右下角的“定”。具体的事写在纸笺上，可以不写，我替你拟。'} {desk}>
  {#snippet foot()}<Seal size="md" id="btn-ding" disabled={!S.domain || soak} aria-label="确定" onclick={confirm}>定</Seal>{/snippet}
</Spread>
