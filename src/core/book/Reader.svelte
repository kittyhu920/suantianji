<script>
  // 读命书（docs/DESIGN.md §19）：书在桌子中央摊开，只用来读。3D 书桌下，这就是桌上那一本书：封面翻开，纸（three-book.js）挂在书里，
  // 做真正的曲面卷页：点页、拖页角、方向键，带惯性和回弹；这个组件不再有自己的画布，只负责画页的纹理、接手势、给读屏朗读。
  // 每一页是 Canvas 2D 画出来的纹理（pages.js 给描述，paint.js 的笔法），字体加载完再画，按 dpr 放大；翻页时不重画任何纹理。
  // 读屏：正文只画在 Canvas 上，读屏读不到，所以另有一份平行的、视觉上隐藏的文本（每页一个 <article>，带标题），
// 每次翻页，把现在这个对页的标题与正文写进朗读区；页码从 1 开始数（docs/DESIGN.md §20）。
// 退回方案：WebGL 不可用、减少动效、手机端，都退回 DOM 里的 2D 书页（桌面是左右两页，手机是单页），点边、滑动、方向键翻页，功能等价。
  //   pages    页描述数组（core/book/pages.js）
  //   narrow   手机宽度（< 960px）
  //   on       书已经摊开（封面翻开的演出放完）：这时才接手势、才朗读
  //   glBook   3D 书桌里的书（scene/book3d.js），有它就在桌上的书里翻页；没有（2D 退回）就用 DOM 的书页
  //   onopen   3D：摊开的演出放完（或被点掉）时回调
  //   closed   读完了：翻过最后一个对页再往后翻一次就是合书（纸翻回去、封面合拢、封面上落一方朱印），点书可以再翻开（回到第一个对页）；绑定给 Codex（页脚的提示、2D 的封面与印）
  //   spread   现在看到第几个对页：0 是扉页单独在书口一侧；3D 的右装书里，第 k 个对页是 第 2k-1 页在右、第 2k 页在左（先读右边、再读左边）；2D 退回是左装，第 2k-1 页在左、第 2k 页在右。绑定给页脚，用来显示这一页的脚注
  import { onMount, tick, untrack } from 'svelte';
  import { PW, PH, ground, folio, loadFonts, embolden } from './paint.js';
  import { deskRef } from '../scene/desk.svelte.js';

  let { pages, narrow = false, on = false, reduced = false, glBook = null, onopen = () => {}, spread = $bindable(0), closed = $bindable(false) } = $props();

  let host;
  let slotL = $state(null);
  let slotR = $state(null);
  let mode = $state('pending'); // 'gl' | 'two' | 'one'
  let engine = null;
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

  let veil = null; // 扉页的“只有纸”的底：书刚摊开时字还没浮现（three-book.js 的 veil）
  let begun = false; // 摊开的演出已经放过
  // 3D 的书是右装：书脊在右，每张纸的正面（偶数页）落在左边、背面（奇数页）落在右边，订口的暗处、页码的位置都要跟着换边；2D 退回是左装
  let rtl = !!glBook && !narrow && !reduced;
  const sideOf = (k) => ((k % 2 === 1) === rtl ? 'R' : 'L'); // 这一页落在对页的哪一边（页码在外侧、订口的暗处在内侧）
  function pushSheets(all) {
    if (!engine || !total) return;
    if (!veil) {
      veil = document.createElement('canvas');
      veil.width = Math.round(PW * scale());
      veil.height = Math.round(PH * scale());
      const g = veil.getContext('2d');
      g.setTransform(scale(), 0, 0, scale(), 0, 0);
      ground(g, 1000, 'L'); // 右装：扉页在左边，订口在它的右侧
    }
    engine.setSheets(Array.from({ length: total / 2 }, (_, i) => ({ front: cvs[2 * i], back: cvs[2 * i + 1], veil: i === 0 ? veil : null })), real >> 1);
    if (spread) engine.setSpread(spread);
    if (!begun) {
      begun = true;
      glBook.beginReading({ onDone: () => { spread = engine?.spread ?? spread; onopen(); } });
    }
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
      const sig = `${rtl ? 'r' : 'l'}:${d ? `${d.id}:${d.sig}` : 'blank'}`;
      if (cvs[k] && sigs[k] === sig) continue;
      const cv = cvs[k] ?? document.createElement('canvas');
      cv.width = Math.round(PW * sc);
      cv.height = Math.round(PH * sc);
      const g = cv.getContext('2d');
      g.setTransform(sc, 0, 0, sc, 0, 0);
      ground(g, 1000 + k * 37, sideOf(k));
      embolden(g);
      if (d) {
        await d.paint(g);
        if (k > 0) folio(g, k, sideOf(k));
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
      if (sheetsChanged || !engine.sheets || !begun) pushSheets();
      else new Set(changed.map((k) => k >> 1)).forEach((i) => engine.touch(i));
    }
    if (mode !== 'gl') show2d();
  }

  /* ───────── 读完合上、落印；点书再翻开 ───────── */
  let shutting = false; // 合书、翻开的演出正在放，不接新的输入
  async function closeBook() {
    if (shutting || closed || !on) return;
    shutting = true;
    if (mode === 'gl' && glBook) {
      closed = true; // 先告诉 Codex：页脚的提示换成合上之后的
      const ok = await glBook.closeBook();
      if (!ok) closed = false;
    } else {
      closed = true; // 2D：Codex 把封面合上、盖印（CSS 的动画，见 book.css 的 .cv-stamp）
      await new Promise((r) => setTimeout(r, reduced ? 0 : 1900));
    }
    shutting = false;
  }
  async function reopenBook() {
    if (shutting || !closed) return;
    shutting = true;
    if (mode === 'gl' && glBook) {
      const ok = await glBook.reopenBook();
      if (ok) closed = false;
    } else {
      closed = false;
      s2 = 0; p1 = 0;
      show2d();
    }
    shutting = false;
  }
  // 合上之后：它不在翻页的位置上；点书、按键都是再翻开
  const atEnd = () => (mode === 'gl' ? !!engine && engine.spread >= engine.limit : mode === 'one' ? p1 >= real - 1 : s2 >= lastSpread());

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
    if (shutting) return;
    if (closed) { reopenBook(); return; }
    if (dir > 0 && atEnd()) { closeBook(); return; }
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
    if (shutting || glBook?.state === 'closing' || glBook?.state === 'opening') return;
    const w = engine.toWorld(e.clientX, e.clientY);
    if (closed) { // 合着的书：点在书上就再翻开（合着的书从书脊向书口，占纸的右半边）
      if (w.x > -40 && w.x < 540 && Math.abs(w.y) < 400) { e.preventDefault(); reopenBook(); }
      return;
    }
    if (Math.abs(w.y) > 380 || Math.abs(w.x) > 520) return;
    const side = w.x >= 0 ? 'R' : 'L';
    if (side === 'R' && engine.spread >= engine.limit) { e.preventDefault(); closeBook(); return; } // 翻到底了，再往后翻一次：合书
    if (side === 'L' && engine.spread <= 0) return;
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
    // 右装的书（3D）从右往左读：←是往后翻（把未读的那一叠翻过来），→是往前翻；2D 退回是左装，→往后
    const dir = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * (mode === 'gl' ? -1 : 1);
    if (closed && (dir || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); reopenBook(); return; }
    if (!dir || shutting) return;
    e.preventDefault();
    if (mode === 'gl') turnGl(dir);
    else go(dir);
  }

  /* ───────── 模式 ───────── */
  async function start() {
    const wantGl = !!glBook && !narrow && !reduced;
    rtl = wantGl;
    mode = wantGl ? 'gl' : narrow ? 'one' : 'two';
    await tick();
    if (dead) return;
    if (mode === 'gl') {
      engine = glBook.reading;
      engine.onSpread = (n) => { spread = n; };
      begun = false;
      if (location.search.includes('debug')) window.__reader = { engine, book: glBook, get mode() { return mode; } };
      pushSheets(); // 引擎起来之前画好的页，现在交给它
      return;
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
      if (engine) engine.onSpread = null; // 纸是书的，书自己收（合上时，见 book3d.js 的 leaveReading）
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
    narrow; reduced; glBook;
    if (first) { first = false; return; }
    untrack(() => {
      if (engine) engine.onSpread = null;
      engine = null;
      s2 = 0; p1 = 0; spread = 0; closed = false; shutting = false;
      const was = rtl;
      start();
      if (was !== rtl) sync(pages); // 左装 / 右装换了，订口与页码的边跟着换，重画
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
  const said = $derived(!on ? '' : closed ? '命书合上了，我在封面落了一方印。' : `${where}。${seen.map((i) => `${titleOf(i)}。${bodyOf(i)}`).join('　')}`);
  // 3D：往后翻到底，再往后翻一次就是合书
  function turnGl(dir) {
    if (!engine || shutting) return;
    if (closed) { reopenBook(); return; }
    if (dir > 0 && engine.spread >= engine.limit && !engine.busy) { closeBook(); return; }
    engine.turn(dir);
  }
  const turnBy = (dir) => { if (mode === 'gl') turnGl(dir); else go(dir); };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="reader" class:is-2d={mode !== 'gl'} class:is-gl={mode === 'gl'} class:is-closed={closed} bind:this={host} role="region" aria-label={label} tabindex="-1" inert={!on}
  onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}>
  {#if mode === 'two' || mode === 'one'}
    <div class="reader-2d" class:is-one={mode === 'one'} onpointerdown={swDown} onpointerup={swUp} onclick={() => { if (closed) reopenBook(); }}>
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
