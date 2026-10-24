<script>
  // 书：整个站点常驻的一册摊开的线装书（docs/DESIGN.md §19）。用 Astro ClientRouter 的 transition:persist 跨路由保留，
  // 从目录进入某一卷、再回目录，都是在这本书里翻页，不整页刷新；字盘的 three.js 画布同样常驻。
  //   天头栏   卷名、回目录、源流与关于、通灵开关、昼夜、声
  //   书       左页是大师的页（这一步的名字），右页是玩家的页（写下的结果）；大师的话写在书页的空白处
  //   案       仪式在书外：器物摆在书前的桌面上，书缩到案的里侧（屏用 <Spread desk> 交进来）
  //   页脚     这一步的说明、本卷的步骤、按钮（主按钮朱印）、存疑印
  // 页面（目录、关于、讲解、各卷）只交一个 <template id="stj-page">（PageData.astro），换页时读它。
  import { onMount } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { juans } from '../juan/index.js';
  import { modules } from '../juan/modules.js';
  import './styles/gloss.css';
  import './styles/end.css';
  import Ritual from './Ritual.svelte';
  import ZhuPanel from './ZhuPanel.svelte';
  import Seal from './Seal.svelte';
  import OracleToggle from './OracleToggle.svelte';
  import { mountTilt } from './tilt.js';
  import { mountToggle } from './theme.js';
  import { mountBoard } from './paper/board.js';
  import { setMuted } from './audio.js';
  import { spread, flip, view, attachBook, turn, toLive, resetBook } from './book/book.svelte.js';
  import { mountGesture } from './book/gesture.js';
  import { shut } from './book/motion.js';
  import { session } from './session.svelte.js';
  import { recall } from './zhu.svelte.js';
  import { cn } from './book/folio.js';

  // 往后翻不动时，书说的话（初稿，待审读）
  const RESIST = ['后面还没写，别急着翻。', '再往后，我还没落笔。', '这一页之后是白纸，等你走到那一步。', '后面的字，我还没写出来。'];

  const blank = { path: '', kind: '', juan: '', title: '演算天机', back: null, tou: [], long: false, left: '', main: '', hint: '', foot: '' };

  function readPage() {
    const t = document.getElementById('stj-page');
    if (!t) return null;
    const part = (n) => t.content.querySelector(`[data-part="${n}"]`)?.innerHTML ?? '';
    const d = t.dataset;
    return {
      path: location.pathname,
      kind: d.kind,
      juan: d.juan,
      title: d.title,
      back: d.backHref ? { href: d.backHref, label: d.backLabel, aria: d.backAria || d.backLabel } : null,
      tou: Array.from(d.tou || '').slice(0, 3),
      long: !!d.long,
      left: part('left'),
      main: part('main'),
      hint: part('hint'),
      foot: part('foot'),
    };
  }

  let page = $state.raw(blank);
  let mounted = $state(false);
  let muted = $state(false);
  let narrow = $state(false);

  let shell;
  let huaxin;
  let pgLeft;
  let pgRight;
  let stage;
  let leftBody;
  let revL;
  let revR;
  let snapL;
  let snapR;
  let canvas;
  let voiceHost;
  let themeBtn;
  let lastResist = 0;

  const juan = $derived(page.kind === 'juan' ? modules[page.juan] ?? null : null);
  const reg = $derived(juan ? juans.find((j) => j.id === juan.id) : null);
  const cur = $derived(juan ? spread.cur : null);
  const ctx = $derived(session.ctx);
  const game = $derived(session.game);
  const hasDesk = $derived(!!cur?.desk);
  const live = $derived(view.pos === view.live);
  const steps = $derived(juan?.steps ?? []);
  const stepIdx = $derived(ctx ? steps.findIndex((s) => s.k === ctx.screen) : -1);
  const atStart = $derived(!ctx || ctx.screen === juan?.start);
  const spreadNo = $derived(view.pos + (live ? (cur?.pager?.i ?? 0) : 0));
  const pager = $derived(live ? cur?.pager : null);

  // 回看写下的页时，大师不开口
  $effect(() => {
    const on = view.pos === view.live;
    session.ctx?.voice?.setLive(on);
  });

  function resist() {
    const now = performance.now();
    if (now - lastResist < 5000) return;
    lastResist = now;
    session.ctx?.gloss(RESIST[Math.floor(Math.random() * RESIST.length)], { key: 'resist' });
  }

  // 进入一页（首次、浏览器的前进后退、点链接）：同一页就只更新内容；换了页就在书里翻一页
  async function onLoad() {
    const next = readPage();
    if (!next) return;
    if (next.path === page.path && next.kind === page.kind && next.juan === page.juan) { page = next; return; }
    const dir = next.kind === 'toc' ? -1 : 1;
    await turn(() => { resetBook(); page = next; }, { dir, record: false });
  }

  function home() {
    if (!game || atStart) { navigate('/'); return; }
    game.toStart();
  }

  function toggleMute(e) {
    muted = !muted;
    setMuted(muted);
    e.currentTarget.blur();
  }

  // 回看写下的页时，右页的显示由 review 换上封存的两页
  let reviewing = false;
  function review(entry) {
    reviewing = !!entry;
    revL.replaceChildren(...(entry ? [entry.L] : []));
    revR.replaceChildren(...(entry ? [entry.R] : []));
    pgLeft.classList.toggle('has-rev', reviewing);
    pgRight.classList.toggle('has-rev', reviewing);
  }

  const voicePages = () => (narrow
    ? [{ page: pgRight, body: reviewing ? revR : stage }]
    : [{ page: pgRight, body: reviewing ? revR : stage }, { page: pgLeft, body: reviewing ? revL : leftBody }]);

  onMount(() => {
    const first = readPage();
    if (first) page = first;
    mounted = true;
    // 卷首开卷：本次会话第一次进入目录页时，书像卷轴一样展开（书是常驻的岛，首帧之前页面上本来就没有书，不会先闪出整页）
    if (first?.kind === 'toc') {
      try {
        if (!sessionStorage.getItem('stj-kaijuan') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          document.documentElement.classList.add('kaijuan');
          setTimeout(() => document.documentElement.classList.remove('kaijuan'), 1500);
        }
        sessionStorage.setItem('stj-kaijuan', '1');
      } catch { /* 不让存储的问题拦住页面 */ }
    }

    const mq = matchMedia('(max-width: 959px)');
    narrow = mq.matches;
    const onMq = () => { narrow = mq.matches; };
    mq.addEventListener('change', onMq);

    mountBoard(document.getElementById('an-board'));
    mountToggle(themeBtn);
    const offTilt = mountTilt(huaxin);
    const offBook = attachBook({
      shell,
      get left() { return reviewing ? revL.firstElementChild ?? leftBody : leftBody; },
      get right() { return reviewing ? revR.firstElementChild ?? stage : stage; },
      get reduced() { return matchMedia('(prefers-reduced-motion: reduce)').matches; },
      mobile: () => mq.matches,
      snaps(l, r) {
        snapL.replaceChildren(...(l ? [l] : []));
        snapR.replaceChildren(...(r ? [r] : []));
      },
      review,
      ready: () => (page.kind === 'juan' ? session.ready : null),
      shut: (commit) => shut(huaxin, commit),
      resist,
    });
    // 点注：回看的页里的术语是快照，没有自己的点击处理，在这里统一接
    const onTermClick = (e) => {
      const t = e.target.closest?.('.is-snap .zhu-term');
      if (t?.dataset.term) recall(t.dataset.term, t);
    };
    huaxin.addEventListener('click', onTermClick);

    document.addEventListener('astro:page-load', onLoad);
    return () => {
      document.removeEventListener('astro:page-load', onLoad);
      huaxin.removeEventListener('click', onTermClick);
      mq.removeEventListener('change', onMq);
      offTilt();
      offBook();
    };
  });

  // 手势：点页、拖页角、方向键翻页（只在某一卷里；目录与讲解页没有写下的页）
  $effect(() => {
    if (!juan || !huaxin) return;
    return mountGesture(huaxin, { left: pgLeft, right: pgRight, mobile: () => narrow, resist });
  });

  const el = () => ({ huaxin, stage, canvas, voice: voiceHost, pages: voicePages });
</script>

<div class="shell" data-kind={page.kind} class:has-desk={hasDesk} class:is-narrow={narrow}>
  <header class="topbar">
    {#if juan}
      <button class="tag-btn" id="btn-home" type="button" aria-label={atStart ? '回到目录' : '回到卷首'} onclick={home}>{atStart ? '目录' : '卷首'}</button>
    {:else if page.back}
      <a class="tag-btn" href={page.back.href} aria-label={page.back.aria}>{page.back.label}</a>
    {:else}
      <span></span>
    {/if}
    {#if juan}
      <p class="top-title"><span class="top-book">演算天机</span><i aria-hidden="true">·</i><span class="top-juan">{juan.name}卷</span><small>{juan.title}</small></p>
    {:else}
      <p class="top-title"><span class="top-book">{page.title}</span></p>
    {/if}
    <div class="top-tools">
      {#if reg}
        <nav class="top-nav" aria-label="本卷与本书">
          {#if reg.source}<a class="top-link" href={reg.source}>{reg.name}卷源流</a>{/if}
          <a class="top-link" href="/about/">关于</a>
        </nav>
      {/if}
      {#if juan?.copy?.oracleToggleDesc}<OracleToggle desc={juan.copy.oracleToggleDesc} />{/if}
      <button class="seal corner-theme" id="btn-theme" type="button" bind:this={themeBtn} aria-label="切换到深色主题：乌金拓">昼</button>
      <button class="tag-btn" id="btn-mute" type="button" aria-pressed={muted} aria-label={muted ? '取消静音' : '静音'} onclick={toggleMute}>声</button>
    </div>
  </header>

  <div class="table">
    <div class="book-wrap">
      <div class="book" class:is-flipping={flip.on} bind:this={shell}>
        <div class="huaxin" bind:this={huaxin}>
          <section class="pg pg-left" aria-label="大师的页" bind:this={pgLeft}>
            <div class="pg-body" bind:this={leftBody}>
              {#if juan}
                <div class="lp">
                  {#if cur}
                    <h2 class="lp-name">{cur.name}</h2>
                    {#if cur.sub}<p class="lp-sub">{cur.sub}</p>{/if}
                    {#if cur.left}<div class="lp-extra">{@render cur.left()}</div>{/if}
                  {/if}
                </div>
              {:else}
                <div class="lp lp-plain">{@html page.left}</div>
              {/if}
            </div>
            <div class="rev rev-l" bind:this={revL}></div>
            <div class="snap snap-l" bind:this={snapL}></div>
            <i class="fish" aria-hidden="true"></i>
            <i class="folio folio-l" aria-hidden="true">{cn(spreadNo * 2 + 1)}</i>
          </section>

          <section class="pg pg-right" aria-label="玩家的页" bind:this={pgRight}>
            {#if page.tou.length > 0}
              <div class="tou" aria-hidden="true">
                {#each page.tou as c}<span class="tou-ch">{c}</span>{/each}
              </div>
            {/if}
            <div class="stage" id="stage" class:is-long={page.long} bind:this={stage}>
              {#if mounted}
                {#if juan}
                  {#key juan.id}<Ritual {juan} el={el()} />{/key}
                {:else if page.kind}
                  <div class="only-narrow static-head">{@html page.left}</div>
                  {@html page.main}
                {/if}
              {/if}
            </div>
            <div class="rev rev-r" bind:this={revR}></div>
            <div class="snap snap-r" bind:this={snapR}></div>
            <i class="fish" aria-hidden="true"></i>
            <i class="folio folio-r" aria-hidden="true">{cn(spreadNo * 2 + 2)}</i>
          </section>

          <i class="spine" aria-hidden="true"></i>
          <canvas class="ink-fx" id="ink-fx" aria-hidden="true" bind:this={canvas}></canvas>
          <div class="voice" id="voice" aria-live="polite" aria-label="大师的话" bind:this={voiceHost}></div>
        </div>
        <i class="zhou zhou-l" aria-hidden="true"></i><i class="zhou zhou-r" aria-hidden="true"></i>
      </div>
    </div>

    <div class="desk" class:is-on={hasDesk} aria-label="案上" aria-hidden={!hasDesk}>
      <div class="desk-plane" aria-hidden="true"></div>
      <div class="desk-items">{#if cur?.desk}{@render cur.desk()}{/if}</div>
    </div>
  </div>

  <footer class="botbar">
    <div class="bot-doubt">
      {#if game && ctx.doubtVisible(game)}
        <Seal size="sm" class="seal-doubt" id="btn-doubt" aria-label="存疑：不再相信这场推演" onclick={() => ctx.pressDoubt(game)}>存疑</Seal>
      {/if}
    </div>
    <div class="bot-mid">
      {#if juan}
        <p class="bot-hint" id="bot-hint">{live ? (cur?.hint ?? '') : '你在翻看写下的页。点右页、拖右页的页角，或按方向键，往后翻回最新的一页。'}{#if live && pager && pager.n > 1}　<span class="pg-no">第 {pager.i + 1} / {pager.n} 页</span>{/if}</p>
        {#if steps.length}
          <ol class="bot-steps" aria-label="本卷的步骤">
            {#each steps as s, i}
              <li class:is-cur={i === stepIdx} class:is-past={stepIdx >= 0 && i < stepIdx} aria-current={i === stepIdx ? 'step' : undefined}>
                {#if i}<i class="stp-arrow" aria-hidden="true">→</i>{/if}<b>{cn(i + 1)}</b><span class="stp-dot" aria-hidden="true">·</span><span class="stp-name">{s.name}</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if reg}
          <p class="bot-links">
            {#if reg.source}<a class="about-link" href={reg.source}>{reg.name}卷源流</a>{/if}
            <a class="about-link" href="/about/">关于这件作品</a>
          </p>
        {/if}
      {:else}
        <p class="bot-hint" id="bot-hint">{@html page.hint}</p>
      {/if}
    </div>
    <div class="bot-acts">
      {#if juan}
        {#if !live}<button class="btn btn-ghost" id="btn-live" onclick={toLive}>回到最新一页</button>{/if}
        {#if cur?.foot}{@render cur.foot()}{/if}
      {:else}
        {@html page.foot}
      {/if}
    </div>
  </footer>
</div>

<ZhuPanel />
