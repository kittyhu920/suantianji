<script>
  // 一条旁注：墨色楷书，数字点朱，句尾一个朱“〇”（与眉批同一套圈点，见 marks.js）
  import { segments } from './marks.js';

  let { text, class: cls = '' } = $props();
</script>

<span class={`ink-note ${cls}`.trim()}>{#each segments(text) as s}{#if s.num}<span class="is-num">{s.t}</span>{:else}{s.t}{/if}{/each}</span>
