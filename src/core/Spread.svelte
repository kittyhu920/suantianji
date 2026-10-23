<script>
  // 一屏的“对页”登记（docs/DESIGN.md §19）：放在屏里任何位置，不渲染任何东西。
  //   name   左页上这一步的名字（大字）
  //   hint   页脚的说明文字（这一步该做什么）；可以随状态变
  //   left   左页要多放的内容（snippet，可选）
  //   foot   页脚右侧的按钮（snippet）：主按钮用朱印，次按钮用 .btn-ghost
  //   pager  { i, n, prev, next }：这一屏内有分页时（结局），页脚给出上一页 / 下一页；左右方向键也由它驱动
  import { onMount } from 'svelte';
  import { registerSpread } from './book/book.svelte.js';

  let props = $props();
  onMount(() => registerSpread({
    get name() { return props.name; },
    get sub() { return props.sub; },
    get hint() { return props.hint; },
    get left() { return props.left; },
    get foot() { return props.foot; },
    get pager() { return props.pager; },
  }));
</script>
