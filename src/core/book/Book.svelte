<script>
  // 合着的书（docs/DESIGN.md §19）：一册线装书平放在桌上，CSS 3D（样式见 styles/stage.css 的 .book）。
  //   封面   深靛布面，左边是书脊，四眼订法的丝线压过书脊；左上贴一张题签，封面四角各留一个残印位（印痕极淡）
  //   厚度   右侧与下沿露出层层纸边；封面绕书脊翻开：2D 退回时仪式里掀起三四十度，读命书时翻开到底（3D 的书在仪式里就翻到底）
  //   voice  扉页上写字的地方（gloss.js）：封面掀起时，书把话写在露出的扉页上
  // stamped：读完合上之后（2D 退回），石章盖在这一局那一卷的残印位上（3D 书桌里的在 scene/book3d.js 的 stampSeal）
  // lift：'shut' 合着 | 'speak' 掀起一个角度 | 'open' 翻开到底。
  // 残印：四个角各对应一卷，印的完整度是这一卷已得的结局数（store 的 stamps，画法在 seal-parts.js）；落印时这一局新得的那一角压下来、洇开
  import { onMount } from 'svelte';
  import { juans } from '../../juan/index.js';
  import { stamps } from '../store.js';
  import { SLOTS, sealCanvas } from './seal-parts.js';
  import { loadFonts } from './paint.js';
  import { bookEl, stage, ledger } from './stage.svelte.js';

  let { lift = 'shut', stamped = false, voice = $bindable(null) } = $props();
  let el;

  // 四个角各对应一卷：左上 签、右上 卦、左下 卜、右下 星
  const CORNERS = SLOTS.map((sl) => sl.id);
  let urls = $state(CORNERS.map(() => ''));   // 每个位上已有的印（图）
  let fresh = $state(null);                   // 落印时压下来的那一角：{ k, url, isNew }
  let alive = true;
  async function draw(pressing) {
    await loadFonts('签卦卜星').catch(() => {});
    if (!alive) return;
    const fi = pressing ? stamps.freshIndex() : -1;
    const k = pressing ? CORNERS.indexOf(stamps.session.juan) : -1;
    urls = CORNERS.map((id, i) => {
      const parts = stamps.parts(id, !(pressing && i === k && fi >= 0)); // 落印时：这一局新得的角先不在位里，由压下来的印带来
      return parts.some(Boolean) ? sealCanvas(i, parts, 120).toDataURL() : '';
    });
    if (pressing && k >= 0) {
      const parts = stamps.parts(CORNERS[k], true);
      fresh = fi >= 0
        ? { k, isNew: true, url: sealCanvas(k, parts.map((_, i) => i === fi), 120, { residue: false }).toDataURL() }
        : { k, isNew: false, url: sealCanvas(k, parts, 120).toDataURL() };
    } else fresh = null;
    if (pressing && fi >= 0) setTimeout(() => { stamps.session.stamped = true; }, 2300); // 盖过了：再合一次书，印不再添新痕
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
        {#each CORNERS as id, i}
          <span class="cv-slot cv-slot-{i}" data-juan={id} aria-hidden="true">
            <svg class="cv-seal" viewBox="0 0 32 32">
              <title>{juans.find((j) => j.id === id)?.name}卷的残印</title>
              <rect x="3" y="3" width="26" height="26" rx="2" fill="none" stroke-dasharray="9 3 5 4 7 3"/>
              <rect x="7" y="7" width="18" height="18" fill="none" stroke-dasharray="3 5" opacity=".6"/>
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
