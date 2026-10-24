<script>
  // 术语：下加点线。点它，在它旁边浮出一条注（像贴在书页上的小纸条）；点别处或按 Esc 收起。
  // 用法：<Zhu term="掷筊" />，或 <Zhu term="圣杯">一平一凸</Zhu>（显示的字与术语不同时）
  import { recall } from './zhu.svelte.js';

  let { term, children } = $props();
  let el;
</script>

<button type="button" class="zhu-term" bind:this={el} data-term={term} onclick={() => recall(term, el)}
  aria-haspopup="dialog" aria-label={`${term}：看注`}>{#if children}{@render children()}{:else}{term}{/if}</button>
