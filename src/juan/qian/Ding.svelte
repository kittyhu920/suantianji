<script>
  // 择域与问事。仪式在桌上：三支木牌摆在桌上，选一支定下方向；问题写在桌上的一张纸笺上（这是唯一需要动手输入的地方），
  // 写完点“定”，字被纸吸进去，书再开口回一句。
  import Seal from '../../core/Seal.svelte';
  import Spread from '../../core/Spread.svelte';

  let { ctx, game } = $props();
  const { S, db } = game;
  let ask = $state('');
  let soak = $state(false);

  const branch = game.branch();
  const from = (S.branchIdx * 2 + 23) % 24;
  const dom = $derived(S.domain ? db.domains[S.domain] : null);

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
    {#each Object.entries(db.domains) as [key, d]}
      <button class="slip" role="radio" aria-checked={S.domain === key} data-key={key} disabled={soak} onclick={() => game.pickDomain(key)}>
        <span class="slip-name">{d.name}</span><span class="slip-desc">{d.desc.replaceAll(' · ', '　')}</span>
      </button>
    {/each}
  </div>
  <div class="ask-sheet paper">
    <p class="shichen" id="shichen">现在的时辰是<b>{branch.zhi}时</b>（{from}–{(from + 2) % 24} 点），五行属{branch.el}</p>
    <p class="ask-domain" id="ask-domain">{#if dom}所问之事：<b>{dom.name}</b>{dom.desc.replaceAll(' · ', '　')}{:else}先取一块木牌，定下想问的方向。{/if}</p>
    {#if soak}
      <p class="ask-written is-soak" id="ask-written">{ask || '（没有写下具体的问题）'}</p>
    {:else}
      <label>
        <span class="ask-label">在纸上写下想问的具体问题（可以不写）</span>
        <textarea class="ask-paper" id="ask" rows="2" maxlength="40" autocomplete="off" spellcheck="false" placeholder="例如：今年该不该换一份工作" bind:value={ask} onkeydown={onKey}></textarea>
      </label>
      <span class="ask-count" aria-hidden="true">{[...ask].length} / 40</span>
    {/if}
  </div>
{/snippet}

<Spread hint={soak ? '字被纸吸进去了。' : S.domain ? '选好了，点右下角的“定”。具体的问题可以不写。' : '先在桌上选一块木牌，再点右下角的“定”。具体的问题写在纸笺上，可以不写。'} {desk}>
  {#snippet foot()}<Seal size="md" id="btn-ding" disabled={!S.domain || soak} aria-label="确定" onclick={confirm}>定</Seal>{/snippet}
</Spread>
