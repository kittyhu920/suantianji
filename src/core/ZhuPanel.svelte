<script>
  // 注：一张贴在书页上的小纸条，浮在被点的术语旁边。点别处、按 Esc、翻页都会收起。
  import { zhu, closePop } from './zhu.svelte.js';

  const kindLabel = { 古籍: '出自古籍', 民俗: '出自民俗', 考古: '出自考古', 原创: '本作原创' };
  const pop = $derived(zhu.pop && zhu.notes[zhu.pop.term] ? { ...zhu.pop, note: zhu.notes[zhu.pop.term] } : null);

  // 纸条的位置：贴着术语，尽量在它下面；下面放不下就放上面；左右不出视口。用视口坐标（position: fixed）
  function place(node, p) {
    const fit = () => {
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;
      const w = Math.min(310, vw - 24);
      node.style.width = `${w}px`;
      const h = node.offsetHeight;
      let left = p.x - w / 2;
      left = Math.max(12, Math.min(vw - w - 12, left));
      let top = p.y + 12;
      if (top + h > vh - 12) top = Math.max(12, p.top - h - 12);
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
      // 纸条上的小尖：指向术语
      node.style.setProperty('--tip', `${Math.max(18, Math.min(w - 18, p.x - left))}px`);
      node.dataset.up = top < p.top ? '1' : '';
    };
    fit();
  }

  // 页在滚动时（长文、结局的页），纸条跟不上术语，收起
  $effect(() => {
    const close = () => { if (zhu.pop) closePop(); };
    document.addEventListener('scroll', close, true);
    return () => document.removeEventListener('scroll', close, true);
  });

  // 术语所在的屏换掉了（术语不在了），纸条也收起
  $effect(() => {
    if (!zhu.pop) return;
    const el = zhu.pop.el;
    const mo = new MutationObserver(() => { if (!el?.isConnected) closePop(); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  });

  function onWindowDown(e) {
    if (!zhu.pop) return;
    if (e.target.closest?.('.zhu-pop, .zhu-term')) return;
    closePop();
  }
</script>

<svelte:window onpointerdown={onWindowDown} onkeydown={(e) => { if (e.key === 'Escape' && zhu.pop) { const el = zhu.pop.el; closePop(); el?.focus?.({ preventScroll: true }); } }} onresize={closePop} />

{#if pop}
  {#key pop.term}
    <div class="zhu-pop" role="dialog" aria-label={`${pop.term}的注`} use:place={pop}>
      <i class="zhu-tape" aria-hidden="true"></i>
      <h3><span class="zhu-name">{pop.term}</span><span class="zhu-kind" data-kind={pop.note.kind}>{kindLabel[pop.note.kind] ?? pop.note.kind}</span></h3>
      <p>{pop.note.body}</p>
      {#if pop.note.cite}<p class="zhu-cite">{pop.note.cite}</p>{/if}
    </div>
  {/key}
{/if}
