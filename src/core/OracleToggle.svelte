<script>
  // "通灵模式"开关：勾选后，结局时由 AI 用大白话解读（需联网）。显示今日剩余次数。
  import { oracle } from './oracle.svelte.js';

  let { desc } = $props(); // 一句说明，由卷提供
  const out = $derived(oracle.remaining === 0);
</script>

<label class="oracle-toggle">
  <input type="checkbox" id="oracle-mode" bind:checked={oracle.enabled} disabled={out}>
  <span class="oracle-row">
    <span class="seal seal-sm seal-outline" aria-hidden="true"><span>灵</span></span>
    <span class="oracle-name">通灵模式</span>
    <span class="oracle-state" aria-hidden="true"></span>
    {#if oracle.remaining != null}<span class="oracle-quota" id="oracle-quota">今日 {oracle.remaining} / {oracle.limit}</span>{/if}
  </span>
  <small class="oracle-desc">{desc}</small>
</label>
