<script>
  // 书桌：整个站点常驻的一张桌子和桌上的书（docs/DESIGN.md §19）。用 Astro ClientRouter 的 transition:persist 跨路由保留，
  // 从书桌点一件器物进卷、再回来，都不整页刷新；字盘的 three.js 画布同样常驻。
  //   天头栏   卷名、回书桌、源流与关于、通灵开关、昼夜、声
  //   书桌     首页：正中一本合上的书，四周摆各卷的器物；进卷：书翻开着摊在桌子里侧，扉页朝上，书的话写在上面；
  //            仪式用桌上的实物完成；仪式完，书滑到桌子中央、摊开，是替你写的命书（Reader.svelte，WebGL 翻页）
  //   按钮槽   这一步的主操作，在桌面下方中央、紧挨着器物（desk/BenchSlot.svelte，docs/DESIGN.md §20）
//   页脚     两行：这一步的说明（读命书时是这一页的脚注）；本卷的步骤、存疑（读命书时是合上、再来、保存）
//   注       术语加点线，点一下贴出一张纸条（ZhuPanel.svelte）
  // 页面（书桌、关于、讲解、各卷）只交一个 <template id="stj-page">（PageData.astro），换页时读它。
  import { onMount, tick } from 'svelte';
  import { navigate } from 'astro:transitions/client';
  import { juans } from '../juan/index.js';
  import { modules } from '../juan/modules.js';
  import Ritual from './Ritual.svelte';
  import OracleToggle from './OracleToggle.svelte';
  import Book from './book/Book.svelte';
  import Reader from './book/Reader.svelte';
  import Instrument from './desk/Instrument.svelte';
  import BenchSlot from './desk/BenchSlot.svelte';
  import ZhuPanel from './ZhuPanel.svelte';
  import Zhu from './Zhu.svelte';
  import { termSegments } from './zhu-text.js';
  import { footnotes } from './book/notes.js';
  import { spread, stage } from './book/stage.svelte.js';
  import { mountTilt } from './tilt.js';
  import { mountToggle } from './theme.js';
  import { mountBoard } from './paper/board.js';
  import { deskState, deskRef, startDesk, stopDesk, wantDeskGL, pieceRect } from './scene/desk.svelte.js';
  import { reducedQuery } from './scene/gate.js';
  import { setMuted, warmAudio } from './audio.js';
  import { session } from './session.svelte.js';
  import { cn } from './cn.js';
  import { bookEl } from './book/stage.svelte.js';
  import { quadMatrix } from './scene/quad.js';

  // 书桌场景的设计尺寸（px）：样式见 styles/stage.css 的 .scene
  const SCENE_W = 1140;
  const SCENE_H = 800;

  // 首页器物的位置（场景坐标，中心点）、大小，以及简介笺放在哪一侧
  const SPOTS = {
    xing: { x: 190, y: 212, w: 200, tip: 'r' },
    qian: { x: 200, y: 500, w: 200, tip: 'r' },
    niao: { x: 350, y: 688, w: 170, tip: 'r' },
    bu: { x: 950, y: 212, w: 230, tip: 'l' },
    gua: { x: 952, y: 490, w: 250, tip: 'l' },
    zi: { x: 790, y: 690, w: 200, tip: 'l' },
    li: { x: 570, y: 702, w: 150, tip: 'r' },
  };

  const blank = { path: '', kind: '', juan: '', title: '演算天机', back: null, left: '', main: '', hint: '', foot: '' };

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
      left: part('left'),
      main: part('main'),
      hint: part('hint'),
      foot: part('foot'),
    };
  }

  let page = $state.raw(blank);
  let mounted = $state(false);
  let table;
  let scene;
  let muted = $state(false);
  let narrow = $state(false);
  // 灯下的 3D 书桌：'pending' 还没定，'on' 用 three.js 的桌子、书与器物，'off' 退回 2D（CSS 的桌面与 SVG 的器物）
  let glState = $state('pending');
  let voice2d = $state(null);
  let voiceGl = $state(null);
  let vplane = $state(null);
  let tip = $state(null); // 悬停的器物：{ id, x, y, w }（画布上的位置）
  let rects = $state({});
  const gl = $derived(glState === 'on');
  const voice = $derived(glState === 'on' ? voiceGl : glState === 'off' ? voice2d : null);
  let themeBtn;
  let readerOn = $state(false);
  let readIdx = $state(0);
  let bookClosed = $state(false); // 命书读完、合上了（Reader 绑定回来）：页脚换提示，2D 里封面合拢、盖印

  const juan = $derived(page.kind === 'juan' ? modules[page.juan] ?? null : null);
  const reg = $derived(juan ? juans.find((j) => j.id === juan.id) : null);
  const cur = $derived(juan ? spread.cur : null);
  const ctx = $derived(session.ctx);
  const game = $derived(session.game);
  const bookPages = $derived(cur?.book ? cur.book() : null);
  const phase = $derived(page.kind === 'home' ? 'home' : juan ? (bookPages ? 'reading' : 'ritual') : 'doc');
  const steps = $derived(juan?.steps ?? []);
  const stepIdx = $derived(ctx ? steps.findIndex((s) => s.k === ctx.screen) : -1);
  const atStart = $derived(!ctx || ctx.screen === juan?.start);
  // 进卷后书就翻开着：3D 里封面平躺在桌上、扉页朝上，一直到结局（直接接到命书的摊开）；只在回书桌时合上。
  // 2D 退回（手机、减少动效）里封面掀起一个角度，写字的纸笺一直在
  const lift = $derived(phase === 'reading' ? (bookClosed && glState !== 'on' ? 'shut' : 'open') : phase === 'ritual' ? (glState === 'on' ? 'open' : 'speak') : 'shut');
  // 读命书时，页脚放这一页（左右两页）的脚注
  // 翻到最后一个对页：页脚多一句“再翻一页，合上。”（脚注少留一条）
  const lastSpread = $derived(bookPages ? bookPages.length >> 1 : 0);
  const atLast = $derived(phase === 'reading' && readerOn && !bookClosed && lastSpread > 0 && readIdx >= lastSpread);
  const notes = $derived(bookPages ? footnotes(juan?.zhu, [readIdx * 2 - 1, readIdx * 2].flatMap((i) => bookPages[i]?.zhu ?? [])).slice(0, atLast ? (narrow ? 1 : 2) : 3) : []);

  // 读命书：3D 书桌下，书原地摊开（Reader 把纸交给桌上的书，演出放完 readerOn 才为真）；2D 退回时，书先滑到桌子中央、封面翻开，再换成 DOM 的书页
  $effect(() => {
    if (phase !== 'reading') { readerOn = false; return; }
    // 3D 的演出由 Reader 起、book3d 放；万一没起来，6 秒后照样让人读
    const t = setTimeout(() => { if (!readerOn) { deskRef.book?.skipIntro(); readerOn = true; } }, gl ? 6000 : session.ctx?.reduced ? 0 : 1500);
    return () => clearTimeout(t);
  });
  // 演出期间，点一下或按键就跳过
  $effect(() => {
    if (!gl || phase !== 'reading' || readerOn) return;
    const skip = () => deskRef.book?.skipIntro();
    const onKey = (e) => { if (['Enter', ' ', 'Escape'].includes(e.key)) skip(); };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', skip, true); window.removeEventListener('keydown', onKey); };
  });
  $effect(() => { if (phase !== 'reading') bookClosed = false; });
  // 读命书时，字盘暂停（翻页的纸要用满合成器；字盘慢慢漂移，这时不画也看不出来）
  $effect(() => {
    document.dispatchEvent(new CustomEvent('stj-flip', { detail: readerOn }));
  });
  let piecesBack = 0;
  let lastPhase3d = '';
  // 3D 书桌随阶段走：书的位姿与封面、器物的位姿
  $effect(() => {
    if (!gl) return;
    const { book, pieces } = deskRef;
    if (!book || !pieces) return;
    const instant = !mounted;
    clearTimeout(piecesBack);
    if (phase === 'home') {
      book.setMode('home', instant);
      // 从命书回来：书先合上、走回里侧，器物再回到桌上（同时回，摊开的书与器物会互相穿插）
      if (lastPhase3d === 'reading' && !instant) piecesBack = setTimeout(() => pieces.toHome(false), 1100);
      else pieces.toHome(instant);
    }
    else if (phase === 'ritual') { book.setMode('ritual', instant); pieces.toRitual(juan.id, instant); }
    else if (phase === 'reading') { book.setMode('reading', instant); pieces.toAway(instant); }
    else if (phase === 'doc') { book.setMode('doc', instant); pieces.toAway(instant); }
    if (phase !== 'home') tip = null;
    lastPhase3d = phase;
  });
  $effect(() => {
    if (!gl || phase === 'reading') return; // 读命书时，封面由摊开的演出管（book3d.js 的 beginReading）
    deskRef.book?.setLift(lift);
  });
  // 读命书时，书不再说话
  $effect(() => {
    if (phase === 'reading') session.ctx?.clearGloss();
  });

  // 进入一页（首次、浏览器的前进后退、点链接）
  function onLoad() {
    const next = readPage();
    if (next) page = next;
  }

  // ───────── 焦点（docs/DESIGN.md §20）─────────
  // 进卷、换屏、进命书、回书桌之后，焦点要落在看得见、用得着的地方，不能留在已经隐藏的首页器物上
  const FOCUSABLE = 'button:not([disabled]):not(.zhu-term), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
  let lastJuan = '';
  let prevPhase = '';
  const lost = () => {
    const a = document.activeElement;
    return !a || a === document.body || !!a.closest?.('.pieces, .reader[aria-hidden="true"]') || !a.isConnected;
  };
  function settle() {
    // 器物里第一个能操作的；没有（入口屏）就是按钮槽里的主按钮
    const within = (root) => FOCUSABLE.split(', ').map((f) => `${root} ${f}`).join(', ');
    const el = table?.querySelector(within('.desk-items')) ?? table?.querySelector(within('.bench-slot'));
    el?.focus({ preventScroll: true });
  }
  // 换屏（含首次进卷）：桌上出现了新的东西
  $effect(() => {
    if (phase !== 'ritual' || !cur) return;
    const t = setTimeout(async () => { await tick(); if (lost()) settle(); }, 80);
    return () => clearTimeout(t);
  });
  // 命书翻开：焦点到命书上，读屏从这里读起；离开命书回书桌：焦点放回刚才那一卷的器物
  $effect(() => {
    const p = phase;
    if (juan) lastJuan = juan.id;
    if (p === prevPhase) return;
    const from = prevPhase;
    prevPhase = p;
    if (p === 'home' && from && lastJuan) {
      setTimeout(() => document.querySelector(`.piece[href*="/${lastJuan}/"]`)?.focus({ preventScroll: true }), 120);
    }
  });
  $effect(() => {
    if (readerOn) tick().then(() => document.querySelector('.reader')?.focus({ preventScroll: true }));
  });

  function home() {
    if (!game || atStart || phase === 'reading') { navigate('/'); return; }
    game.toStart();
  }

  function toggleMute(e) {
    muted = !muted;
    setMuted(muted);
    e.currentTarget.blur();
  }

  // 书的话：写在扉页上。字是 DOM，按扉页（翻开后露出的那一块）的四个角投影到屏幕，用一个透视变换贴上去
  function placeVoice() {
    if (!vplane || !deskRef.book) return;
    const q = deskRef.book.pageQuad();
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const w = Math.max(80, (dist(q[0], q[1]) + dist(q[3], q[2])) / 2);
    const h = w * q.ratio;
    vplane.style.width = `${w.toFixed(1)}px`;
    vplane.style.height = `${h.toFixed(1)}px`;
    vplane.style.transform = quadMatrix(q, w, h);
  }

  onMount(() => {
    onLoad();
    mounted = true;
    const mq = matchMedia('(max-width: 959px)');
    narrow = mq.matches;
    const onMq = () => { narrow = mq.matches; };
    mq.addEventListener('change', onMq);

    // 书桌是一块固定大小的场景（SCENE_W × SCENE_H），窗口不够大就整体等比缩小
    const fit = () => {
      if (!table || !scene) return;
      const w = table.clientWidth;
      const h = table.clientHeight;
      if (!w || !h) return;
      const k = Math.min(w / SCENE_W, h / SCENE_H, 1.12);
      scene.style.setProperty('--k', k.toFixed(4));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(table);
    fit();

    mountBoard(document.getElementById('an-board'));
    mountToggle(themeBtn);
    const offTilt = mountTilt(table);

    // ───── 灯下的 3D 书桌 ─────
    let lastRects = '';
    const refreshRects = () => {
      if (!deskRef.desk || phase !== 'home') return;
      const next = {};
      for (const j of juans) { const r = pieceRect(j.id); if (r) next[j.id] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; }
      const sig = JSON.stringify(next);
      if (sig !== lastRects) { lastRects = sig; rects = next; }
    };
    let lastView = -1;
    let lastBook = -1;
    const onFrame = () => {
      const d = deskRef.desk;
      const b = deskRef.book;
      if (!d || !b) return;
      if (d.view.version !== lastView || b.version !== lastBook) {
        lastView = d.view.version;
        lastBook = b.version;
        placeVoice();
      }
      refreshRects();
    };
    const hover = (id) => {
      if (!id || phase !== 'home') { tip = null; return; }
      const r = pieceRect(id);
      tip = r ? { id, ...r } : null;
    };
    const lose = () => { glState = 'off'; };
    const bootGL = async () => {
      if (!wantDeskGL()) { glState = 'off'; return; }
      const ok = await startDesk(table, { juans, onOpen: (j) => navigate(j.href), onHover: hover, onLost: lose });
      if (!ok) { glState = 'off'; return; }
      deskRef.desk.listeners.add(onFrame);
      bookEl.gl = deskRef.book;
      glState = 'on';
      deskRef.desk.fit();
      refreshRects();
    };
    bootGL();
    const dropGL = () => {
      deskRef.desk?.listeners.delete(onFrame);
      bookEl.gl = null;
      stopDesk();
      glState = 'off';
    };
    const onWide = () => {
      if (narrow && glState === 'on') dropGL();
      else if (!narrow && glState === 'off' && wantDeskGL()) { glState = 'pending'; bootGL(); }
    };
    mq.addEventListener('change', onWide);
    reducedQuery.addEventListener?.('change', () => { if (reducedQuery.matches && glState === 'on') dropGL(); else if (!reducedQuery.matches && glState === 'off' && wantDeskGL()) { glState = 'pending'; bootGL(); } });

    // 声音引擎在空闲时建好（见 audio.js 的 warmAudio）
    const idle = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 1500);
    idle(() => { try { warmAudio(); } catch { /* 没有声音就没有 */ } });
    document.addEventListener('astro:page-load', onLoad);
    return () => {
      document.removeEventListener('astro:page-load', onLoad);
      mq.removeEventListener('change', onMq);
      mq.removeEventListener('change', onWide);
      ro.disconnect();
      offTilt();
    };
  });
</script>

<div class="shell" data-phase={phase} data-reader={readerOn ? (bookClosed ? 'closed' : 'on') : 'off'} class:is-narrow={narrow} class:is-gl={gl}>
  {#if page.kind === 'home' || juan}<h1 class="visually-hidden">{juan ? `演算天机　${juan.name}卷　${juan.title}` : '演算天机　书桌'}</h1>{/if}
  <header class="topbar">
    {#if juan}
      <button class="tag-btn" id="btn-home" type="button" aria-label={atStart || phase === 'reading' ? '回到书桌' : '回到卷首'} onclick={home}>{atStart || phase === 'reading' ? '书桌' : '卷首'}</button>
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

  <div class="table" class:is-gl={gl} bind:this={table}>
    <div class="scene" bind:this={scene}>
      <div class="desk-plane" aria-hidden="true"></div>

      <!-- 首页：四周摆各卷的器物。悬停浮起，旁边出现卷名与简介；点开了卷的器物进那一卷（2D 退回时；3D 的见下面的 pieces-gl） -->
      {#if !gl}
      <nav class="pieces" aria-label="书桌上的器物，一件一卷" inert={phase !== 'home'}>
        {#each juans as j}
          {@const p = SPOTS[j.id]}
          {#if j.open}
            <a class="piece tip-{p.tip}" href={j.href} style="--x:{p.x}px;--y:{p.y}px;--w:{p.w}px" tabindex={phase === 'home' ? 0 : -1} aria-label={`${j.name}卷：${j.title}。${j.intro}`}>
              <span class="piece-art"><Instrument id={j.id} /></span>
              <span class="piece-label" aria-hidden="true"><b>{j.name}</b>{j.title}</span>
              <span class="piece-tip"><span class="piece-name">{j.name}<small>{j.title}</small></span><span class="piece-intro">{j.intro}</span></span>
            </a>
          {:else}
            <div class="piece is-closed tip-{p.tip}" style="--x:{p.x}px;--y:{p.y}px;--w:{p.w}px" aria-label={`${j.name}卷：${j.title}，未开卷`}>
              <span class="piece-art"><Instrument id={j.id} /></span>
              <span class="piece-label" aria-hidden="true"><b>{j.name}</b>未开卷</span>
              <span class="piece-tip"><span class="piece-name">{j.name}<small>{j.title}</small></span><span class="piece-intro">{j.intro}</span><span class="piece-tag">未开卷</span></span>
            </div>
          {/if}
        {/each}
      </nav>
      {/if}

      <div class="book-anchor" aria-hidden={phase === 'doc'}>
        <Book {lift} stamped={bookClosed && !gl} bind:voice={voice2d} />
      </div>
      {#if mounted && juan && voice}{#key `${juan.id}:${glState}`}<Ritual {juan} {voice} />{/key}{/if}

      <!-- 仪式：器物摆在桌面的中前部 -->
      <div class="desk" aria-label="桌上" inert={phase !== 'ritual'}>
        <div class="desk-items">{#if cur?.desk}{@render cur.desk()}{/if}</div>
      </div>
    </div>

    {#if gl}
      <!-- 3D 书桌上的器物：键盘与读屏的入口（位置跟着器物投影到屏幕上的矩形），指针由画布拾取（pieces/index.js） -->
      <nav class="pieces-gl" aria-label="书桌上的器物，一件一卷" inert={phase !== 'home'}>
        {#each juans as j}
          {@const r = rects[j.id]}
          {#if r}
            {#if j.open}
              <a class="piece-hit" href={j.href} style="left:{r.x}px;top:{r.y}px;width:{r.w}px;height:{r.h}px" tabindex={phase === 'home' ? 0 : -1}
                aria-label={`${j.name}卷：${j.title}。${j.intro}`} onfocus={() => deskRef.pieces?.focus(j.id)} onblur={() => deskRef.pieces?.focus(null)}></a>
            {:else}
              <div class="piece-hit is-closed" style="left:{r.x}px;top:{r.y}px;width:{r.w}px;height:{r.h}px" role="img" aria-label={`${j.name}卷：${j.title}，未开卷`}></div>
            {/if}
          {/if}
        {/each}
      </nav>
      {#if tip && phase === 'home'}
        {@const j = juans.find((x) => x.id === tip.id)}
        <div class="piece-card" class:is-closed={!j.open} style="left:{Math.max(8, Math.min(tip.x + tip.w / 2 - 105, (table?.clientWidth ?? 1200) - 218))}px;top:{Math.max(8, tip.y - 10)}px">
          <span class="piece-name">{j.name}<small>{j.title}</small></span>
          <span class="piece-intro">{j.intro}</span>
          {#if !j.open}<span class="piece-tag">未开卷</span>{/if}
        </div>
      {/if}
      <!-- 书的话：写在扉页上（字是 DOM，用透视变换贴在 3D 的扉页上，见 placeVoice） -->
      <div class="voice-plane" bind:this={vplane}>
        <div class="voice" bind:this={voiceGl}></div>
      </div>
    {/if}

    {#if phase === 'ritual' && cur?.act}
      <BenchSlot>{@render cur.act()}</BenchSlot>
    {/if}

    {#if phase === 'doc' && mounted}
      <article class="doc-sheet paper" aria-label={page.title}>
        {@html page.left}
        {@html page.main}
      </article>
    {/if}

    {#if phase === 'reading' && bookPages}
      <Reader pages={bookPages} {narrow} on={readerOn} reduced={ctx?.reduced ?? false} glBook={gl ? deskRef.book : null} onopen={() => { readerOn = true; }} bind:spread={readIdx} bind:closed={bookClosed} />
    {/if}
  </div>

  <footer class="botbar">
    {#if juan}
      {#if phase === 'reading' && bookClosed}
        <p class="bot-hint" id="bot-hint">书合上了，点一下书，可以再翻开读。</p>
      {:else if phase === 'reading' && notes.length}
        <ul class="bot-notes" id="bot-notes" aria-label="这一页的注">
          {#each notes as n}<li><b>{n.term}</b>{n.body}<small>{n.kind}</small></li>{/each}
          {#if atLast}<li class="bot-end">再翻一页，合上。</li>{/if}
        </ul>
      {:else if atLast}
        <p class="bot-hint" id="bot-hint">再翻一页，合上。</p>
      {:else}
        <p class="bot-hint" id="bot-hint">{#each termSegments(cur?.hint ?? '', juan.zhu) as sg}{#if sg.term}<Zhu term={sg.term}>{sg.t}</Zhu>{:else}{sg.t}{/if}{/each}</p>
      {/if}
    {:else}
      <p class="bot-hint" id="bot-hint">{@html page.hint}</p>
    {/if}
    <div class="bot-row">
      {#if game && ctx.doubtVisible(game)}
        <button class="doubt-btn" id="btn-doubt" type="button" aria-label="存疑：不再相信这场推演" onclick={() => ctx.pressDoubt(game)}>存疑</button>
      {/if}
      {#if juan && steps.length && phase !== 'reading'}
        <ol class="bot-steps" aria-label="本卷的步骤">
          {#each steps as s, i}
            <li class:is-cur={i === stepIdx} class:is-past={stepIdx >= 0 && i < stepIdx} aria-current={i === stepIdx ? 'step' : undefined}>
              {#if i}<i class="stp-arrow" aria-hidden="true">→</i>{/if}<b>{cn(i + 1)}</b><span class="stp-dot" aria-hidden="true">·</span><span class="stp-name">{s.name}</span>
            </li>
          {/each}
        </ol>
      {/if}
      <div class="bot-acts">
        {#if juan}
          {#if cur?.foot}{@render cur.foot()}{/if}
        {:else}
          {@html page.foot}
        {/if}
      </div>
    </div>
  </footer>
</div>

<ZhuPanel />
