<script>
  // 一屏的登记（docs/DESIGN.md §19）：放在屏里任何位置，不渲染任何东西。
  //   hint   页脚的说明文字（这一步在桌上该做什么）；可以随状态变
  //   foot   页脚右侧的按钮（snippet）：主按钮用朱印，次按钮用 .btn-ghost
  //   desk   桌上的器物（snippet，可选）：仪式在桌上，用实物完成
  //          器物里要接指针或物理的元素，用 use: 动作去接（它们由 Codex 渲染，不在屏的 onMount 里）
  //   book   命书（可选，只有结局屏）：返回页的数组的函数，见 book/pages.js；有它，书就摊开来读
  import { onMount } from 'svelte';
  import { registerSpread } from './book/stage.svelte.js';

  let props = $props();
  onMount(() => registerSpread({
    get hint() { return props.hint; },
    get foot() { return props.foot; },
    get desk() { return props.desk; },
    get book() { return props.book; },
  }));
</script>
