<script>
  // 一屏的“对页”登记（docs/DESIGN.md §19）：放在屏里任何位置，不渲染任何东西。
  //   name   左页上这一步的名字（大字）
  //   sub    名字下面的小字
  //   hint   页脚的说明文字（这一步在书外该做什么）；可以随状态变
  //   left   左页要多放的内容（snippet，可选）
  //   foot   页脚右侧的按钮（snippet）：主按钮用朱印，次按钮用 .btn-ghost
  //   desk   案上的器物（snippet，可选）：仪式在书外，用桌上的实物完成；有它，书就缩到案的里侧、器物摆在书前
  //          器物里要接指针或物理的元素，用 use: 动作去接（它们由 Codex 渲染，不在屏的 onMount 里）
  //   record 这一对页写完后要不要封存成写下的页，供回看；等待中的空页写 false（默认 true）
  //   pager  { i, n, to(i) }：这一屏内有分页时（结局），分页之间可以自由翻；to(i) 同步地换到第 i 页
  import { onMount } from 'svelte';
  import { registerSpread } from './book/book.svelte.js';

  let props = $props();
  onMount(() => registerSpread({
    get name() { return props.name; },
    get sub() { return props.sub; },
    get hint() { return props.hint; },
    get left() { return props.left; },
    get foot() { return props.foot; },
    get desk() { return props.desk; },
    get record() { return props.record; },
    get pager() { return props.pager; },
  }));
</script>
