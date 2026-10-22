<script>
  // 卜卷入口：一个手绘的“卜”字（仿甲骨字形），一团赭红的余烬，“灼”字印章。
  // 墨痕不画线（docs/DESIGN.md §8）；余烬是一团柔边的赭红晕，隔一阵洇开一次。
  import Seal from '../../core/Seal.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Glyph from './Glyph.svelte';
  import { GLYPH_NOTE } from './glyphs.js';

  let { ctx, game } = $props();
</script>

<section class="screen screen-title bu-title is-active" data-screen="title" aria-labelledby="t-title">
  <div class="bu-hero">
    <figure class="glyph-hero">
      <div class="glyph-ember" aria-hidden="true"></div>
      <Glyph ch="卜" size={170} />
      <figcaption>卜 · {GLYPH_NOTE}</figcaption>
    </figure>
    <h1 id="t-title" class="bu-title-main">甲骨灼卜</h1>
  </div>
  <p class="title-sub">你灼龟，我读兆</p>
  <div class="glyph-row" aria-label="几个仿甲骨字形：贞、日、月、雨">
    {#each ['贞', '日', '月', '雨'] as c}
      <figure><Glyph ch={c} size={46} /><figcaption>{c}</figcaption></figure>
    {/each}
    <p class="glyph-note">{GLYPH_NOTE}</p>
  </div>
  <div class="title-actions">
    <Seal size="lg" id="btn-enter" aria-describedby="enter-note" onclick={game.begin}>卜</Seal>
    <p id="enter-note" class="note">点红色的“卜”字印章开始。三千多年前的<Zhu term="殷墟" />，人们在<Zhu term="甲骨" />上占卜。我替你备了一块<Zhu term="龟腹甲" />，按住<Zhu term="钻凿" />来<Zhu term="灼" />，看裂出的<Zhu term="兆" />。<br>全程约三分钟，建议打开声音。</p>
    <p class="title-links">
      <a class="about-link" href="/bu/yuanliu/">卜卷源流</a>
      <a class="about-link" href="/about/">关于这件作品</a>
    </p>
  </div>
</section>
