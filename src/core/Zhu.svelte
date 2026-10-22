<script>
  // 术语：下加点线。出现在眼前时，桌面注栏同步出注；点它回看（手机上弹出浮注）。
  // 用法：<Zhu term="掷筊" />，或 <Zhu term="圣杯">一平一凸</Zhu>（显示的字与术语不同时）
  import { onMount } from 'svelte';
  import { reveal, recall } from './zhu.svelte.js';

  let { term, children } = $props();
  let el;

  onMount(() => {
    if (!('IntersectionObserver' in window)) { reveal(term); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { reveal(term); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  });
</script>

<button type="button" class="zhu-term" bind:this={el} onclick={() => recall(term, el)}
  aria-label={`${term}：查看注`}>{#if children}{@render children()}{:else}{term}{/if}</button>
