<script>
  // 读命书（docs/DESIGN.md §19）：书在桌子中央摊开，只用来读。翻页用 WebGL（three-book.js）做真正的曲面卷页：点页、拖页角、方向键，
  // 带惯性和回弹。每一页是 Canvas 2D 画出来的纹理（pages.js 给描述，paint.js 的笔法），字体加载完再画，按 dpr 放大；翻页时不重画任何纹理。
  // 读屏：正文只画在 Canvas 上，读屏读不到，所以另有一份平行的、视觉上隐藏的文本（每页一个 <article>，带标题），
// 每次翻页，把现在这个对页的标题与正文写进朗读区；页码从 1 开始数（docs/DESIGN.md §20）。
// 退回方案：WebGL 不可用、减少动效、手机端，都退回 DOM 里的 2D 书页（桌面是左右两页，手机是单页），点边、滑动、方向键翻页，功能等价。
  //   pages    页描述数组（core/book/pages.js）
  //   narrow   手机宽度（< 960px）
  //   on       书已经摊开（封面翻开的动画放完）：这时才显示
  //   spread   现在看到第几个对页：0 是扉页单独在右边，k 是 第 2k-1 页在左、第 2k 页在右；绑定给页脚，用来显示这一页的脚注
  import { onMount, tick, untrack } from 'svelte';
  import { PW, PH, ground, folio, loadFonts } from './paint.js';

  let { pages, narrow = false, on = false, reduced = false, spread = $bindable(0) } = $props();

  let host;
  let glCanvas = $state(null);
  let slotL = $state(null);
  let slotR = $state(null);
  let mode = $state('pending'); // 'gl' | 'two' | 'one'
  let engine = null;
  let ro = null;
  let dead = false;
  const cvs = []; // 每一页的画布
  const sigs = [];
  let total = 0;
  let real = 0; // 真正有内容的页数（total 是补成偶数之后的）；最多翻到 floor(real / 2) 个对页
  let s2 = $state(0); // 2D 双页：对页序号
  let p1 = $state(0); // 2D 单页：页序号
  let turning = $state(0); // 2D 翻页动画的方向（1 往后、-1 往前），0 是静止
  let loaded = $state(0); // 画好了几页（画完才显示 2D 的页）

  const scale = () => Math.min(1.5, Math.max(1.25, window.devicePixelRatio || 1));
  const frame = () => new Promise((r) => requestAnimationFrame(r));

  function webglOk() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  }

  /* ───────── 画页 ───────── */
  let token = 0;
  async function sync(list) {
    const my = ++token;
    await loadFonts(list.map((p) => p.text).join(''));
    if (my !== token || dead) return;
    const n = list.length;
    real = n;
    const t = n % 2 ? n + 1 : n; // 补成偶数：最后一张纸的背面是空白
    const sc = scale();
    const changed = [];
    for (let k = 0; k < t; k++) {
      const d = list[k];
      const sig = d ? `${d.id}:${d.sig}` : 'blank';
      if (cvs[k] && sigs[k] === sig) continue;
      const cv = cvs[k] ?? document.createElement('canvas');
      cv.width = Math.round(PW * sc);
      cv.height = Math.round(PH * sc);
      const g = cv.getContext('2d');
      g.setTransform(sc, 0, 0, sc, 0, 0);
      ground(g, 1000 + k * 37, k % 2 ? 'L' : 'R');
      if (d) {
        await d.paint(g);
        if (k > 0) folio(g, k, k % 2 ? 'L' : 'R');
      }
      cvs[k] = cv;
      sigs[k] = sig;
      changed.push(k);
      loaded = k + 1;
      await frame(); // 一页一页画，不堵住主线程
      if (my !== token || dead) return;
    }
    const sheetsChanged = t !== total;
    cvs.length = total = t;
    sigs.length = t;
    if (mode === 'gl' && engine) {
      if (sheetsChanged || !engine.sheets) engine.setSheets(Array.from({ length: t / 2 }, (_, i) => ({ front: cvs[2 * i], back: cvs[2 * i + 1] })), n >> 1);
      else new Set(changed.map((k) => k >> 1)).forEach((i) => engine.touch(i));
    }
    if (mode !== 'gl') show2d();
  }

  /* ───────── 2D 退回方案 ───────── */
  const lastSpread = () => real >> 1;
  function show2d() {
    if (!slotR) return;
    if (mode === 'one') {
      slotR.replaceChildren(...(cvs[p1] ? [cvs[p1]] : []));
      spread = (p1 + 1) >> 1;
      return;
    }
    slotL?.replaceChildren(...(cvs[2 * s2 - 1] ? [cvs[2 * s2 - 1]] : []));
    slotR.replaceChildren(...(cvs[2 * s2] ? [cvs[2 * s2]] : []));
    spread = s2;
  }
  async function go(dir) {
    if (mode === 'one') {
      const to = Math.max(0, Math.min(real - 1, p1 + dir));
      if (to === p1) return;
      turning = reduced ? 0 : dir;
      p1 = to;
    } else {
      const to = Math.max(0, Math.min(lastSpread(), s2 + dir));
      if (to === s2) return;
      turning = reduced ? 0 : dir;
      s2 = to;
    }
    show2d();
    if (turning) setTimeout(() => { turning = 0; }, 480);
  }

  /* ───────── 手势：点页翻页、拖页角（WebGL 下） ───────── */
  let down = null;
  function onDown(e) {
    if (mode !== 'gl' || !engine || !on || e.button > 0) return;
    const w = engine.toWorld(e.clientX, e.clientY);
    if (Math.abs(w.y) > 380 || Math.abs(w.x) > 520) return;
    const side = w.x >= 0 ? 'R' : 'L';
    if ((side === 'R' && engine.spread >= engine.limit) || (side === 'L' && engine.spread <= 0)) return;
    e.preventDefault();
    host.setPointerCapture?.(e.pointerId);
    down = { x: e.clientX, y: e.clientY, side, handle: null };
  }
  function onMove(e) {
    if (!down) return;
    if (!down.handle && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) down.handle = engine.drag(down.side);
    if (down.handle) {
      const w = engine.toWorld(e.clientX, e.clientY);
      down.handle.move(w.x, w.y);
    }
  }
  function onUp() {
    if (!down) return;
    if (down.handle) down.handle.end();
    else engine.turn(down.side === 'R' ? 1 : -1);
    down = null;
  }
  // 2D：横向滑动翻页（手机）
  let swipe = null;
  function swDown(e) { swipe = { x: e.clientX, y: e.clientY }; }
  function swUp(e) {
    if (!swipe) return;
    const dx = e.clientX - swipe.x;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - swipe.y)) go(dx < 0 ? 1 : -1);
    swipe = null;
  }

  function onKey(e) {
    if (!on || e.target.closest?.('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (mode === 'gl') engine?.turn(dir);
    else go(dir);
  }

  /* ───────── 模式 ───────── */
  async function start() {
    const wantGl = !narrow && !reduced && webglOk();
    mode = wantGl ? 'gl' : narrow ? 'one' : 'two';
    await tick();
    if (dead) return;
    if (mode === 'gl') {
      try {
        const { createBookGL } = await import('./three-book.js');
        if (dead) return;
        engine = await createBookGL(glCanvas, { onSpread: (n) => { spread = n; } });
        if (dead) { engine.dispose(); engine = null; return; }
        const size = () => { const r = host.getBoundingClientRect(); if (r.width) engine?.resize(r.width, r.height); };
        ro = new ResizeObserver(size);
        ro.observe(host);
        size();
        if (location.search.includes('debug')) window.__reader = { engine, get mode() { return mode; } };
        // 引擎起来之前画好的页，现在交给它
        if (total) engine.setSheets(Array.from({ length: total / 2 }, (_, i) => ({ front: cvs[2 * i], back: cvs[2 * i + 1] })), real >> 1);
        if (spread) engine.setSpread(spread);
        return;
      } catch {
        engine?.dispose?.();
        engine = null;
        mode = narrow ? 'one' : 'two'; // WebGL 起不来：退回 2D
        await tick();
      }
    }
    if (total) show2d();
  }

  onMount(() => {
    start();
    window.addEventListener('keydown', onKey);
    return () => {
      dead = true;
      token++;
      window.removeEventListener('keydown', onKey);
      ro?.disconnect();
      engine?.dispose();
      engine = null;
    };
  });

  // 页变了（通灵回话、同类人的数字到了、页数变了）：只重画变了的那几页
  $effect(() => {
    const list = pages;
    untrack(() => { sync(list); });
  });
  // 窗口跨过手机宽度、减少动效变了：换一种读法（回到扉页）
  let first = true;
  $effect(() => {
    narrow; reduced;
    if (first) { first = false; return; }
    untrack(() => {
      ro?.disconnect();
      engine?.dispose();
      engine = null;
      s2 = 0; p1 = 0; spread = 0;
      start();
    });
  });
  // 2D 模式下，页画好之后挂进去
  $effect(() => {
    if ((mode === 'two' || mode === 'one') && slotR && loaded) untrack(show2d);
  });

  /* ───────── 读屏 ───────── */
  const titleOf = (i) => pages[i]?.title ?? `第 ${i + 1} 页`;
  // 正文以标题开头的（页的 text 是“标题+正文”拼起来的），去掉重复的标题
  const bodyOf = (i) => { const p = pages[i]; if (!p) return ''; const t = titleOf(i); return p.text.startsWith(t) ? p.text.slice(t.length) : p.text; };
  const countOf = () => (mode === 'one' ? pages.length : (pages.length >> 1) + 1);
  // 现在看到的页：2D 单页是第 p1 页；其余是对页 spread（0 是扉页单独在右边）
  const seen = $derived(mode === 'one' ? [p1] : spread === 0 ? [0] : [2 * spread - 1, 2 * spread].filter((i) => i < pages.length));
  const where = $derived(mode === 'one' ? `第 ${p1 + 1} 页，共 ${countOf()} 页` : `第 ${spread + 1} 个对页，共 ${countOf()} 个`);
  const label = $derived(pages ? `命书，${where}` : '命书');
  // 朗读区的内容：翻到哪，读哪。书还没摊开的时候不读
  const said = $derived(on ? `${where}。${seen.map((i) => `${titleOf(i)}。${bodyOf(i)}`).join('　')}` : '');
  const turnBy = (dir) => { if (mode === 'gl') engine?.turn(dir); else go(dir); };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="reader" class:is-2d={mode !== 'gl'} bind:this={host} role="region" aria-label={label} tabindex="-1" inert={!on}
  onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}>
  {#if mode === 'gl'}
    <canvas bind:this={glCanvas} aria-hidden="true"></canvas>
  {:else if mode === 'two' || mode === 'one'}
    <div class="reader-2d" class:is-one={mode === 'one'} onpointerdown={swDown} onpointerup={swUp}>
      {#if mode === 'two'}<div class="rd-page is-left" class:is-blank={s2 === 0} class:is-turn={turning} style:--from={turning > 0 ? '-26px' : '26px'} bind:this={slotL}></div>{/if}
      <div class="rd-page is-right" class:is-turn={turning} style:--from={turning > 0 ? '26px' : '-26px'} bind:this={slotR}></div>
      <button class="rd-nav rd-prev" type="button" aria-label="上一页" onclick={() => go(-1)}></button>
      <button class="rd-nav rd-next" type="button" aria-label="下一页" onclick={() => go(1)}></button>
      {#if mode === 'one'}<p class="rd-page-no">{p1 + 1} / {real}</p>{/if}
    </div>
  {/if}
  {#if mode === 'gl'}
    <!-- 画布上没有按钮：给键盘与读屏另备两个（平时看不见，聚焦时显出来） -->
    <div class="rd-sr-nav">
      <button type="button" onclick={() => turnBy(-1)}>上一个对页</button>
      <button type="button" onclick={() => turnBy(1)}>下一个对页</button>
    </div>
  {/if}
  <!-- 朗读区：翻到哪一页，就把这个对页的标题与正文写在这里 -->
  <p class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{said}</p>
  <!-- 平行的文本：整本命书，每页一个 <article>，带标题（Canvas 上的字，读屏读不到） -->
  <div class="visually-hidden" aria-label="命书全文">
    {#each pages as p, i (p.id + i)}
      <article aria-labelledby={`rd-h-${i}`}>
        <h2 id={`rd-h-${i}`}>{titleOf(i)}</h2>
        <p>{bodyOf(i)}</p>
      </article>
    {/each}
  </div>
</div>
