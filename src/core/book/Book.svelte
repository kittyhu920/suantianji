<script>
  // 合着的书（docs/DESIGN.md §19）：一册线装书平放在桌上，CSS 3D（样式见 styles/stage.css 的 .book）。
  //   封面   深靛布面，左边是书脊，四眼订法的丝线压过书脊；左上贴一张题签，封面四角各留一个残印位（印痕极淡）
  //   厚度   右侧与下沿露出层层纸边；封面绕书脊翻开：2D 退回时仪式里掀起三四十度，读命书时翻开到底（3D 的书在仪式里就翻到底）
  //   voice  扉页上写字的地方（gloss.js）：封面掀起时，书把话写在露出的扉页上
  // lift：'shut' 合着 | 'speak' 掀起一个角度 | 'open' 翻开到底。残印的数据是 store 里的 stamps（本批只画出空位）。
  import { onMount } from 'svelte';
  import { juans } from '../../juan/index.js';
  import { stamps } from '../store.js';
  import { bookEl, stage } from './stage.svelte.js';

  let { lift = 'shut', voice = $bindable(null) } = $props();
  let el;

  // 四个角各对应一卷：左上 签、右上 卦、左下 卜、右下 星
  const CORNERS = ['qian', 'gua', 'bu', 'xing'];
  let got = $state({});
  onMount(() => {
    got = stamps.all();
    bookEl.el = el;
    return () => { if (bookEl.el === el) bookEl.el = null; };
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
      <div class="bk-slip"><div class="voice" bind:this={voice}></div></div>
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
          <svg class="cv-seal cv-seal-{i}" class:is-got={got[id]} data-juan={id} viewBox="0 0 32 32" aria-hidden="true">
            <title>{juans.find((j) => j.id === id)?.name}卷的残印</title>
            <rect x="3" y="3" width="26" height="26" rx="2" fill="none" stroke-dasharray="9 3 5 4 7 3"/>
            <rect x="7" y="7" width="18" height="18" fill="none" stroke-dasharray="3 5" opacity=".6"/>
          </svg>
        {/each}
      </div>
      <div class="cv-inner"></div>
    </div>
  </div>
</div>
