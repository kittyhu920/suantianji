<script>
  // 卦卷入口：标题墨痕、“问”字印章。墨痕是静态图（img/title-ink.svg），入卷时被一笔“写”出来（样式在 qian.css，两卷共用）。
  import Seal from '../../core/Seal.svelte';

  let { ctx, game } = $props();
</script>

<section class="screen screen-title is-active" data-screen="title" aria-labelledby="t-title">
  <div class="title-block">
    <img class="title-ink-img" src="/img/title-ink.svg" alt="" aria-hidden="true">
    <h1 id="t-title" class="title-main">演算天机</h1>
  </div>
  <p class="title-sub">你起卦，我算你</p>
  <div class="title-actions">
    <Seal size="lg" id="btn-enter" aria-describedby="enter-note" onclick={game.begin}>问</Seal>
    <p id="enter-note" class="note">点红色的“问”字印章开始。<br>三枚铜钱，掷六回，约三分钟，建议打开声音。</p>
    <p class="title-links">
      <a class="about-link" href="/gua/yuanliu/">卦卷源流</a>
      <a class="about-link" href="/about/">关于这件作品</a>
    </p>
  </div>
</section>
