<script>
  // 仪式页的公共外壳：舞台（本卷的各屏）、眉批槽、注栏、墨与水的画布、角上的按钮。
  // 一卷（src/juan/<id>/index.js）只需交出屏、数据与规矩，见 src/juan/index.js 里的接口说明。
  import { onMount, untrack } from 'svelte';
  import './styles/gloss.css';
  import './styles/end.css';
  import { createCtx } from './ctx.svelte.js';
  import { setNotes, resetZhu } from './zhu.svelte.js';
  import { refreshQuota } from './oracle.svelte.js';
  import { setMuted } from './audio.js';
  import ZhuPanel from './ZhuPanel.svelte';
  import Seal from './Seal.svelte';
  import PosterDialog from './end/PosterDialog.svelte';

  let { juan } = $props();

  const ctx = createCtx(juan);
  let game = $state(null);
  let stage;
  let canvas;
  let glossHost;
  let muted = $state(false);

  const Screen = $derived(juan.screens[ctx.screen]);
  const Defs = juan.Defs;
  const atStart = $derived(ctx.screen === juan.start);

  // 换屏之后：滚回顶部，必要时从指尖洇开
  $effect(() => {
    ctx.shownCount;
    untrack(() => ctx.afterShow());
  });

  onMount(() => {
    const huaxin = stage.closest('.huaxin');
    setNotes(juan.zhu ?? {});
    ctx.attach({ huaxin, stage, canvas, glossHost });
    let alive = true;
    (async () => {
      const g = await juan.enter(ctx);
      if (alive) game = g;
      refreshQuota();
    })();
    return () => {
      alive = false;
      game?.destroy?.();
      resetZhu();
      ctx.destroy();
    };
  });

  function toggleMute(e) {
    muted = !muted;
    setMuted(muted);
    e.currentTarget.blur();
  }

  function home() {
    if (atStart || !game) { location.href = '/'; return; }
    game.toStart();
  }

  const portal = (node) => {
    document.body.append(node);
    return { destroy() { node.remove(); } };
  };
</script>

{#if Defs}<Defs />{/if}

<div class="stage" id="stage" bind:this={stage}>
  {#if game}
    {#key ctx.shownCount}
      <Screen {ctx} {game} />
    {/key}
  {/if}
</div>

<ZhuPanel />

<canvas class="ink-fx" id="ink-fx" aria-hidden="true" bind:this={canvas}></canvas>
<aside class="margin" id="margin" aria-label="大师的眉批" aria-live="polite" bind:this={glossHost}></aside>

<button class="corner-btn corner-home" id="btn-home" type="button" aria-label={atStart ? '回到目录' : '回到卷首'} onclick={home}>{atStart ? '目录' : '卷首'}</button>
<button class="corner-btn corner-mute" id="btn-mute" type="button" aria-pressed={muted} aria-label={muted ? '取消静音' : '静音'} onclick={toggleMute}>声</button>
{#if game?.doubtVisible}
  <Seal size="sm" class="seal-doubt" id="btn-doubt" aria-label="存疑：不再相信这场推演" onclick={() => game.doubt()}>存疑</Seal>
{/if}

{#if game?.makePoster}
  <div use:portal>
    <PosterDialog {ctx} bind:open={game.posterOpen} make={game.makePoster} />
  </div>
{/if}
