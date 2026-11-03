<script>
  // 合着的书（docs/DESIGN.md §19）：一册线装书平放在桌上，CSS 3D（样式见 styles/stage.css 的 .book）。
  //   封面   深靛布面，左边是书脊，四眼订法的丝线压过书脊；左上贴一张题签，题签右边一列四个结局印位（遵、逆、破、迷，空框极淡）
  //   厚度   右侧与下沿露出层层纸边；封面绕书脊翻开：2D 退回时仪式里掀起三四十度，读命书时翻开到底（3D 的书在仪式里就翻到底）
  //   voice  扉页上写字的地方（gloss.js）：封面掀起时，书把话写在露出的扉页上
  // stamped：读完合上之后（2D 退回），石章盖在这一局结局的印位上（3D 书桌里的在 scene/book3d.js 的 stampSeal）
  // lift：'shut' 合着 | 'speak' 掀起一个角度 | 'open' 翻开到底。
  // 结局印位：四个位就是四种结局（遵、逆、破、迷），在任何一卷得过就是完整一方朱印（store 的 stamps，画法在 seals.js）；落印时这一局的印压下来，新得的洇开
  import { onMount } from 'svelte';
  import { stamps, ENDING_KEYS } from '../store.js';
  import { SLOT_CHARS, sealCanvas } from './seals.js';
  import { loadFonts } from './paint.js';
  import { bookEl, stage, ledger } from './stage.svelte.js';

  let { lift = 'shut', stamped = false, voice = $bindable(null) } = $props();
  let el;

  // 四个位从上到下：遵、逆、破、迷
  let urls = $state(ENDING_KEYS.map(() => ''));   // 每个位上已有的印（图）
  let fresh = $state(null);                       // 落印时压下来的印：{ k, url, isNew }
  let alive = true;
  async function draw(pressing) {
    await loadFonts(SLOT_CHARS.join('')).catch(() => {});
    if (!alive) return;
    const fk = pressing ? stamps.freshKey() : null;
    const k = pressing ? ENDING_KEYS.indexOf(stamps.session.key) : -1;
    const got = stamps.got(!fk); // 落印时：这一局新得的印先不在位里，由压下来的印带来
    urls = ENDING_KEYS.map((key, i) => (got[key] ? sealCanvas(i, 120).toDataURL() : ''));
    fresh = k >= 0 ? { k, isNew: !!fk, url: sealCanvas(k, 120).toDataURL() } : null;
    if (fk) setTimeout(() => { stamps.session.stamped = true; }, 2300); // 盖过了：再合一次书，印不再添新痕
  }
  $effect(() => { stamped; lift; draw(stamped); });
  onMount(() => {
    bookEl.el = el;
    return () => { alive = false; if (bookEl.el === el) bookEl.el = null; };
  });
</script>

<div class="book" data-lift={lift} bind:this={el}>
  <!-- 朗读区：书说的每一句也写在这里，读屏软件会读（扉页上的字逐字洇开、放在 aria-hidden 里，读不到）。放在 aria-hidden 之外，视觉上隐藏 -->
  <p class="visually-hidden" id="book-said" role="status" aria-live="polite" aria-atomic="true">{#key stage.saidN}{#if stage.said}<span>书说：{stage.said}</span>{/if}{/key}</p>
  <i class="bk-shadow" aria-hidden="true"></i>
  <div class="bk-body" aria-hidden="true">
    <i class="bk-back"></i>
    <i class="bk-edge bk-edge-r"></i>
    <i class="bk-edge bk-edge-b"></i>
    <div class="bk-sheet">
      <div class="bk-slip"><div class="voice" bind:this={voice}></div>{#if ledger.items.length}<p class="slip-ledger">{ledger.items[ledger.items.length - 1].text}</p>{/if}</div>
    </div>
    <div class="bk-cover">
      <div class="cv-front">
        <i class="cv-spine"></i>
        <svg class="cv-stitch" viewBox="0 0 250 350" aria-hidden="true">
          <g fill="none" stroke="#1a1308" stroke-width="3.4" stroke-linecap="round" opacity=".45" transform="translate(.8 1.2)">
            <path d="M22 60 V292"/><path d="M22 60 H0 M22 140 H0 M22 212 H0 M22 292 H0"/><path d="M0 16 L22 60 M0 334 L22 292"/>
          </g>
          <g fill="none" stroke="#e9e0c8" stroke-width="2.6" stroke-linecap="round">
            <path d="M22 60 V292"/><path d="M22 60 H0 M22 140 H0 M22 212 H0 M22 292 H0"/><path d="M0 16 L22 60 M0 334 L22 292"/>
          </g>
          <g fill="#0e0a05">{#each [60, 140, 212, 292] as y}<circle cx="22" cy={y} r="3"/>{/each}</g>
        </svg>
        <div class="cv-label"><span>演算天机</span></div>
        {#each SLOT_CHARS as ch, i}
          <span class="cv-slot cv-slot-{i}" data-ending={ENDING_KEYS[i]} aria-hidden="true">
            <svg class="cv-seal" viewBox="0 0 32 32">
              <title>“{ch}”字印</title>
              <rect x="3" y="3" width="26" height="26" rx="2" fill="none"/>
            </svg>
            {#if urls[i]}<img class="cv-got" src={urls[i]} alt="" />{/if}
            {#if fresh && fresh.k === i}<img class="cv-press" class:is-flash={!fresh.isNew} src={fresh.url} alt="" />{/if}
          </span>
        {/each}
      </div>
      <div class="cv-inner"></div>
    </div>
  </div>
</div>
