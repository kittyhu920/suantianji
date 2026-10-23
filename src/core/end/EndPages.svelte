<script>
  // 结局分页：内容多（解签、判词、坦白、账本、命盘、通灵、四种结局），拆成几个对页，一页一页翻着看。
  // 每个对页 { name, hint, left, right }：left 是左页的内容，right 是右页的内容（都是 snippet）。
  // 页脚给出“上一页 / 下一页”，主操作（保存、再来一局）由 foot 提供，每一页都在。
  // 手机只有一页：左页的内容排在右页内容之前。
  import { onMount } from 'svelte';
  import Spread from '../Spread.svelte';

  let { ctx, pages, foot, label = '观象' } = $props();
  let pg = $state(0);
  let narrow = $state(typeof matchMedia === 'function' && matchMedia('(max-width: 959px)').matches);

  onMount(() => {
    const mq = matchMedia('(max-width: 959px)');
    const h = () => { narrow = mq.matches; };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  });

  const n = $derived(pages.length);
  const go = (d) => {
    const to = pg + d;
    if (to < 0 || to >= n) return;
    ctx.turn(() => { pg = to; }, { dir: d });
  };
  const pager = {
    get i() { return pg; },
    get n() { return n; },
    get prev() { return pg > 0 ? () => go(-1) : undefined; },
    get next() { return pg < n - 1 ? () => go(1) : undefined; },
  };
  const page = $derived(pages[pg]);
</script>

<section class="screen screen-end is-active" data-screen="end" aria-label={label}>
  {#if narrow && page.left}{@render page.left()}{/if}
  {@render page.right()}
</section>
<Spread name={page.name} sub={page.sub} hint={page.hint} left={narrow ? undefined : page.left} {foot} {pager} />
