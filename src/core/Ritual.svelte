<script>
  // 一卷的仪式：创建卷的运行环境（ctx）与一局（game），把当前这一屏画进书的右页（docs/DESIGN.md §19）。
  // 书本身（天头栏、两页、案、页脚）是常驻的 Codex.svelte，这里只管“这一卷”：
  //   进入卷时挂上，离开（回目录、换卷）时清理；换屏时翻页由 ctx.show 负责。
  // 一卷（src/juan/<id>/index.js）只需交出屏、数据与规矩，见 src/juan/index.js 里的接口说明。
  import { onMount, untrack, tick } from 'svelte';
  import './styles/end.css';
  import { createCtx } from './ctx.svelte.js';
  import { setNotes, resetZhu } from './zhu.svelte.js';
  import { refreshQuota } from './oracle.svelte.js';
  import { resetBook, flip, view, nav, bounce } from './book/book.svelte.js';
  import { session } from './session.svelte.js';
  import PosterDialog from './end/PosterDialog.svelte';

  // el：Codex 交进来的书的部件 { huaxin, stage, canvas, voice, pages }
  let { juan, el } = $props();

  const ctx = createCtx(juan);
  let game = $state(null);

  const Screen = $derived(juan.screens[ctx.screen]);
  const Defs = juan.Defs;

  // 换屏之后：滚回顶部
  $effect(() => {
    ctx.shownCount;
    untrack(() => ctx.afterShow());
  });

  onMount(() => {
    setNotes(juan.zhu ?? {});
    ctx.attach(el);
    resetBook();
    if (location.search.includes('debug')) window.__book = { flip, view, ctx, nav, bounce }; // 调试：手动翻页与抗拒
    let alive = true;
    session.juan = juan;
    session.ctx = ctx;
    session.game = null;
    session.ready = (async () => {
      const g = await juan.enter(ctx);
      if (!alive) return;
      game = g;
      session.game = g;
      ctx.watch(g);
      refreshQuota();
      await tick();
    })();
    return () => {
      alive = false;
      game?.destroy?.();
      resetZhu();
      ctx.destroy();
      session.juan = session.ctx = session.game = session.ready = null;
    };
  });

  const portal = (node) => {
    document.body.append(node);
    return { destroy() { node.remove(); } };
  };
</script>

{#if Defs}<Defs />{/if}

{#if game}
  {#key ctx.shownCount}
    <Screen {ctx} {game} />
  {/key}
{/if}

{#if game?.makePoster}
  <div use:portal>
    <PosterDialog {ctx} bind:open={game.posterOpen} make={game.makePoster} />
  </div>
{/if}
