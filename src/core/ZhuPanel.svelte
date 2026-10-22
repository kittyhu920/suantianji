<script>
  // 注栏（桌面，右侧）与浮注（手机）
  import { zhu, closePop } from './zhu.svelte.js';

  let { class: cls = '' } = $props();
  const kindLabel = { 古籍: '出自古籍', 民俗: '出自民俗', 原创: '本作原创' };
  const pop = $derived(zhu.pop && zhu.notes[zhu.pop.term] ? { ...zhu.pop, note: zhu.notes[zhu.pop.term] } : null);

  // 浮注的位置：贴着术语，尽量在它下面；下面放不下就放上面；左右不出画心
  function place(node, p) {
    const fit = () => {
      const pr = node.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const w = Math.min(300, pr.width - 24);
      node.style.width = `${w}px`;
      const h = node.offsetHeight;
      let left = p.x - pr.left - w / 2;
      left = Math.max(12, Math.min(pr.width - w - 12, left));
      let top = p.y - pr.top + 8;
      if (top + h > pr.height - 12) top = Math.max(12, p.top - pr.top - h - 8);
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    };
    fit();
  }

  function onWindowDown(e) {
    if (!zhu.pop) return;
    if (e.target.closest?.('.zhu-pop, .zhu-term')) return;
    closePop();
  }
</script>

<svelte:window onpointerdown={onWindowDown} onkeydown={(e) => { if (e.key === 'Escape') closePop(); }} />

<aside class={`zhu-col ${cls}`} aria-label="注">
  <h2 class="zhu-h"><span>注</span></h2>
  {#if !zhu.shown.length}
    <p class="zhu-empty">仪式里遇到不熟的词，我在这里作注。</p>
  {/if}
  <div class="zhu-list" aria-live="polite">
    {#each zhu.shown as term, i (term)}
      {@const n = zhu.notes[term]}
      <article class="zhu-note" class:is-new={i === 0} class:is-focus={zhu.focus === term} class:is-old={i >= 3}>
        <h3><span class="zhu-name">{term}</span><span class="zhu-kind" data-kind={n.kind}>{kindLabel[n.kind] ?? n.kind}</span></h3>
        <p>{n.body}</p>
        {#if n.cite}<p class="zhu-cite">{n.cite}</p>{/if}
      </article>
    {/each}
  </div>
</aside>

{#if pop}
  {#key pop.term}
    <div class="zhu-pop" role="dialog" aria-label={`${pop.term}的注`} use:place={pop}>
      <h3><span class="zhu-name">{pop.term}</span><span class="zhu-kind" data-kind={pop.note.kind}>{kindLabel[pop.note.kind] ?? pop.note.kind}</span></h3>
      <p>{pop.note.body}</p>
      {#if pop.note.cite}<p class="zhu-cite">{pop.note.cite}</p>{/if}
    </div>
  {/key}
{/if}
