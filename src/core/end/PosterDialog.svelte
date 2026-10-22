<script>
  // 分享图：把这一局装裱成一张图，可下载、可分享。图怎么画由各卷的 make() 决定。
  import { onDestroy, untrack } from 'svelte';

  // make()：返回 Promise<{ blob, name }>
  let { ctx, open = $bindable(false), make } = $props();
  let status = $state(true);
  let url = $state('');
  let name = $state('');
  let file = $state(null);
  let closeBtn;
  const canShare = $derived(!!file && !!navigator.canShare?.({ files: [file] }));

  $effect(() => {
    if (!open) return;
    let gone = false;
    status = true;
    untrack(() => { if (url) URL.revokeObjectURL(url); }); // 先放掉上一张图，再清空
    url = '';
    file = null;
    closeBtn?.focus();
    make().then(({ blob, name: n }) => {
      if (gone) return;
      url = URL.createObjectURL(blob);
      name = n;
      file = new File([blob], n, { type: 'image/png' });
      status = false;
    });
    return () => { gone = true; };
  });

  onDestroy(() => { if (url) URL.revokeObjectURL(url); });
  const close = () => { open = false; };
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="poster" id="poster" role="dialog" aria-modal="true" aria-label={ctx.copy.posterTitle} onclick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div class="poster-box">
      {#if status}<p class="poster-status" id="poster-status">{ctx.copy.posterWait}</p>{/if}
      {#if url}
        <img id="poster-img" src={url} alt={ctx.copy.posterAlt}>
        <p class="poster-tip" id="poster-tip">{ctx.coarse ? '长按图片即可保存' : '也可以在图片上右键另存'}</p>
      {/if}
      <div class="poster-actions">
        {#if url && !ctx.coarse}<a class="btn btn-primary" id="poster-download" href={url} download={name}>下载图片</a>{/if}
        {#if url && canShare}<button class="btn btn-primary" id="poster-share" onclick={() => navigator.share({ files: [file], title: '演算天机' }).catch(() => {})}>分享</button>{/if}
        <button class="btn" id="poster-close" bind:this={closeBtn} onclick={close}>关闭</button>
      </div>
    </div>
  </div>
{/if}
