<script>
  // 仪式页的公共外壳：一册摊开的线装书（docs/DESIGN.md §19）。
  //   header  卷名、回目录、昼夜印、声
  //   书      左页是大师的页（天头眉批、这一步的名字、页边的注），右页是玩家的页（本卷这一屏）；换屏就翻一页
  //   footer  这一步的说明、本卷的步骤、按钮（主按钮朱印）
  // 一卷（src/juan/<id>/index.js）只需交出屏、数据与规矩，见 src/juan/index.js 里的接口说明。
  import { onMount, untrack } from 'svelte';
  import './styles/gloss.css';
  import './styles/end.css';
  import './styles/book.css';
  import { createCtx } from './ctx.svelte.js';
  import { setNotes, resetZhu } from './zhu.svelte.js';
  import { refreshQuota } from './oracle.svelte.js';
  import { setMuted } from './audio.js';
  import ZhuPanel from './ZhuPanel.svelte';
  import Seal from './Seal.svelte';
  import { mountTilt } from './tilt.js';
  import { mountToggle } from './theme.js';
  import { spread, flip, attachBook } from './book/book.svelte.js';
  import { cn } from './book/folio.js';
  import PosterDialog from './end/PosterDialog.svelte';

  let { juan } = $props();

  const ctx = createCtx(juan);
  let game = $state(null);
  let shell;
  let huaxin;
  let stage;
  let canvas;
  let glossHost;
  let leftBody;
  let snapL;
  let snapR;
  let themeBtn;
  let muted = $state(false);

  const Screen = $derived(juan.screens[ctx.screen]);
  const Defs = juan.Defs;
  const atStart = $derived(ctx.screen === juan.start);
  const cur = $derived(spread.cur);
  const steps = juan.steps ?? [];
  const stepIdx = $derived(steps.findIndex((s) => s.k === ctx.screen));
  const folio = $derived(cn(Math.max(0, stepIdx) * 2 + 2));

  // 换屏之后：滚回顶部
  $effect(() => {
    ctx.shownCount;
    untrack(() => ctx.afterShow());
  });

  onMount(() => {
    setNotes(juan.zhu ?? {});
    ctx.attach({ huaxin, stage, canvas, glossHost });
    const offTilt = mountTilt(huaxin);
    mountToggle(themeBtn);
    const mobile = () => matchMedia('(max-width: 959px)').matches;
    const offBook = attachBook({
      shell, right: stage, left: leftBody, reduced: ctx.reduced, mobile,
      snaps(l, r) {
        snapL.replaceChildren(...(l ? [l] : []));
        snapR.replaceChildren(...(r ? [r] : []));
      },
    });
    if (location.search.includes('debug')) window.__book = { flip, ctx };
    let alive = true;
    (async () => {
      const g = await juan.enter(ctx);
      if (alive) { game = g; ctx.watch(g); }
      refreshQuota();
    })();
    return () => {
      alive = false;
      offTilt();
      offBook();
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

  // 方向键只在“可以前进或后退”时翻页，不让玩家跳过仪式的步骤
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const p = cur?.pager;
    if (!p) return;
    if (e.key === 'ArrowRight' && p.next) { e.preventDefault(); p.next(); }
    else if (e.key === 'ArrowLeft' && p.prev) { e.preventDefault(); p.prev(); }
  }

  // 手机上左右滑动翻页（同样只在有分页时）
  let sx = 0;
  let sy = 0;
  const swipeStart = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; };
  const swipeEnd = (e) => {
    const p = cur?.pager;
    if (!p) return;
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    if (dx < 0 && p.next) p.next();
    else if (dx > 0 && p.prev) p.prev();
  };

  const portal = (node) => {
    document.body.append(node);
    return { destroy() { node.remove(); } };
  };
</script>

<svelte:window onkeydown={onKey} />

{#if Defs}<Defs />{/if}

<div class="shell">
  <header class="topbar">
    <button class="tag-btn" id="btn-home" type="button" aria-label={atStart ? '回到目录' : '回到卷首'} onclick={home}>{atStart ? '目录' : '卷首'}</button>
    <p class="top-title"><span class="top-book">演算天机</span><i aria-hidden="true">·</i><span class="top-juan">{juan.name}卷</span><small>{juan.title}</small></p>
    <div class="top-tools">
      <button class="seal corner-theme" id="btn-theme" type="button" bind:this={themeBtn} aria-label="切换到深色主题：乌金拓">昼</button>
      <button class="tag-btn" id="btn-mute" type="button" aria-pressed={muted} aria-label={muted ? '取消静音' : '静音'} onclick={toggleMute}>声</button>
    </div>
  </header>

  <div class="book-wrap">
    <div class="book" class:is-flipping={flip.on} bind:this={shell}>
      <div class="huaxin" bind:this={huaxin}>
        <section class="pg pg-left" aria-label="大师的页">
          <aside class="margin" id="margin" aria-label="大师的眉批" aria-live="polite" bind:this={glossHost}></aside>
          <div class="pg-body" bind:this={leftBody}>
            <div class="lp">
              {#if cur}
                <h2 class="lp-name">{cur.name}</h2>
                {#if cur.sub}<p class="lp-sub">{cur.sub}</p>{/if}
                {#if cur.left}<div class="lp-extra">{@render cur.left()}</div>{/if}
              {/if}
              <ZhuPanel kind="notes" />
            </div>
          </div>
          <div class="snap snap-l" bind:this={snapL}></div>
          <i class="fish" aria-hidden="true"></i>
          <i class="folio folio-l" aria-hidden="true">{cn(Math.max(0, stepIdx) * 2 + 1)}</i>
        </section>

        <section class="pg pg-right" aria-label="玩家的页">
          <div class="stage" id="stage" bind:this={stage} ontouchstart={swipeStart} ontouchend={swipeEnd}>
            {#if game}
              {#key ctx.shownCount}
                <Screen {ctx} {game} />
              {/key}
            {/if}
          </div>
          <div class="snap snap-r" bind:this={snapR}></div>
          <i class="fish" aria-hidden="true"></i>
          <i class="folio folio-r" aria-hidden="true">{folio}</i>
        </section>

        <i class="spine" aria-hidden="true"></i>
        <canvas class="ink-fx" id="ink-fx" aria-hidden="true" bind:this={canvas}></canvas>
        <ZhuPanel kind="pop" />
      </div>
    </div>
  </div>

  <footer class="botbar">
    <div class="bot-doubt">
      {#if game && ctx.doubtVisible(game)}
        <Seal size="sm" class="seal-doubt" id="btn-doubt" aria-label="存疑：不再相信这场推演" onclick={() => ctx.pressDoubt(game)}>存疑</Seal>
      {/if}
    </div>
    <div class="bot-mid">
      <p class="bot-hint" id="bot-hint">{cur?.hint ?? ''}</p>
      {#if cur?.pager && cur.pager.n > 1}
        {@const p = cur.pager}
        <div class="bot-pager" aria-label="翻页">
          <button class="pg-btn" type="button" disabled={!p.prev} onclick={p.prev} aria-label="上一页">‹ 上一页</button>
          <span class="pg-no">第 {p.i + 1} / {p.n} 页</span>
          <button class="pg-btn" type="button" disabled={!p.next} onclick={p.next} aria-label="下一页">下一页 ›</button>
        </div>
      {:else if steps.length}
        <ol class="bot-steps" aria-label="本卷的步骤">
          {#each steps as s, i}
            <li class:is-cur={i === stepIdx} class:is-past={stepIdx >= 0 && i < stepIdx} aria-current={i === stepIdx ? 'step' : undefined}>
              {#if i}<i class="stp-arrow" aria-hidden="true">→</i>{/if}<b>{cn(i + 1)}</b><span class="stp-dot" aria-hidden="true">·</span><span class="stp-name">{s.name}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
    <div class="bot-acts">
      {#if cur?.foot}{@render cur.foot()}{/if}
    </div>
  </footer>
</div>

{#if game?.makePoster}
  <div use:portal>
    <PosterDialog {ctx} bind:open={game.posterOpen} make={game.makePoster} />
  </div>
{/if}
