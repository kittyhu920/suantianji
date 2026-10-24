<script>
  // "通灵模式"开关：勾选后，结局时由 AI 用大白话解读（需联网）。显示今日剩余次数。
  // 放在天头栏里（书外），说明文字在鼠标悬停时显示；窄屏只留一枚"灵"印。
  import { oracle } from './oracle.svelte.js';

  let { desc } = $props(); // 一句说明，由卷提供
  const out = $derived(oracle.remaining === 0);
</script>

<label class="oracle-toggle is-bar" title={desc}>
  <input type="checkbox" id="oracle-mode" bind:checked={oracle.enabled} disabled={out} aria-describedby="oracle-desc">
  <span class="oracle-row">
    <span class="seal seal-sm seal-outline" aria-hidden="true"><span>灵</span></span>
    <span class="oracle-name">通灵</span>
    <span class="oracle-state" aria-hidden="true"></span>
    {#if oracle.remaining != null}<span class="oracle-quota" id="oracle-quota">今日 {oracle.remaining} / {oracle.limit}</span>{/if}
  </span>
  <small class="visually-hidden" id="oracle-desc">{desc}</small>
</label>
