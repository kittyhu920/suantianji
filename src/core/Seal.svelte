<script>
  // 印章按钮：朱色只给印章。size：sm / md / lg
  // 按下：印往下压（base.css 的 :active）；松手：轻微一震，印迹在边上晕开一圈（.is-print，见下）。
  // 所有朱印按钮共用这一个效果；减少动效下不播。
  // 多数印按下就换屏，按钮随屏消失，一震还没演完：这时在原处留一枚"影印"把这一震演完。
  let { size = 'md', class: cls = '', children, onclick, ...rest } = $props();

  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function play(el) {
    el.classList.remove('is-print');
    void el.offsetWidth; // 连点时重新播放
    el.classList.add('is-print');
  }

  function ghost(src, rect, host) {
    const h = host.getBoundingClientRect();
    src.removeAttribute('id');
    src.removeAttribute('disabled');
    src.setAttribute('aria-hidden', 'true');
    src.tabIndex = -1;
    src.style.cssText = `position:absolute;margin:0;right:auto;bottom:auto;pointer-events:none;z-index:7;`
      + `left:${rect.left - h.left}px;top:${rect.top - h.top}px;width:${rect.width}px;height:${rect.height}px;`;
    src.classList.add('is-print');
    src.addEventListener('animationend', (e) => { if (e.animationName === 'seal-thud') src.remove(); });
    host.append(src);
    setTimeout(() => src.remove(), 900);
  }

  function press(e) {
    const el = e.currentTarget;
    if (still()) { onclick?.(e); return; }
    const src = el.cloneNode(true);
    const rect = el.getBoundingClientRect();
    const host = el.closest('.huaxin');
    play(el);
    onclick?.(e);
    if (host) requestAnimationFrame(() => { if (!el.isConnected) ghost(src, rect, host); });
  }
  const done = (e) => { if (e.animationName === 'seal-thud') e.currentTarget.classList.remove('is-print'); };
</script>

<button class={`seal seal-${size} ${cls}`.trim()} {...rest} onclick={press} onanimationend={done}><span>{@render children?.()}</span></button>

<style>
  :global(.seal.is-print) {
    animation: seal-thud .42s cubic-bezier(.3, .8, .3, 1);
  }
  :global(.seal.is-print::before) { /* 印迹：朱色的一圈，从印边晕开、淡去 */
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    animation: seal-print .42s ease-out both;
  }
  @keyframes -global-seal-thud {
    0% { transform: translateY(2px) scale(.9); }
    28% { transform: translate(1px, 0) scale(1.05) rotate(.8deg); }
    50% { transform: translate(-1px, 1px) scale(.98) rotate(-.7deg); }
    75% { transform: translate(.5px, 0) scale(1.01); }
    100% { transform: none; }
  }
  @keyframes -global-seal-print {
    0% { box-shadow: 0 0 0 0 rgba(179, 38, 31, .55); }
    100% { box-shadow: 0 0 0 calc(var(--s) * .13) rgba(179, 38, 31, 0); }
  }
</style>
