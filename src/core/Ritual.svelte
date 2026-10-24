<script>
  // 一卷的仪式：创建卷的运行环境（ctx）与一局（game），把当前这一屏挂上（docs/DESIGN.md §19）。
  // 书桌本身（天头栏、书、桌、页脚）是常驻的 Codex.svelte，这里只管“这一卷”：
  //   进入卷时挂上，离开（回书桌、换卷）时清理。屏自己不画页面，只用 <Spread> 把器物、说明、按钮交给 Codex。
  // 一卷（src/juan/<id>/index.js）只需交出屏、数据与规矩，见 src/juan/index.js 里的接口说明。
  import { onMount } from 'svelte';
  import { createCtx } from './ctx.svelte.js';
  import { refreshQuota } from './oracle.svelte.js';
  import { session } from './session.svelte.js';
  import PosterDialog from './end/PosterDialog.svelte';

  // voice：合着的书上写字的地方（Codex 交进来）
  let { juan, voice } = $props();

  const ctx = createCtx(juan);
  let game = $state(null);

  const Screen = $derived(juan.screens[ctx.screen]);
  const Defs = juan.Defs;

  onMount(() => {
    ctx.attach({ voice });
    if (location.search.includes('debug')) window.__ctx = ctx; // 调试：手动让书说话
    let alive = true;
    session.juan = juan;
    session.ctx = ctx;
    session.game = null;
    (async () => {
      const g = await juan.enter(ctx);
      if (!alive) return;
      game = g;
      session.game = g;
      ctx.watch(g);
      refreshQuota();
    })();
    return () => {
      alive = false;
      game?.destroy?.();
      ctx.destroy();
      session.juan = session.ctx = session.game = null;
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
