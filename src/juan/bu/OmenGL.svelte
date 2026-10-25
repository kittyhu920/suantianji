<script>
  // 兆在 3D 的龟甲上裂开（docs/DESIGN.md §15）：龟甲翻到正面，兆纹一道道长出来，贴在甲上的纹理（还是 shell.js 的 Canvas 画法）。
  // 不渲染任何 DOM；兆长全了调 onDone；离开（再灼一处、对贞）时龟甲翻回背面。
  import { onMount } from 'svelte';
  import { deskRef } from '../../core/scene/desk.svelte.js';

  let { ctx, crack, spot, other = null, otherSpot = null, delay = 0, onDone } = $props();

  onMount(() => {
    const piece = deskRef.pieces?.list.bu;
    if (!piece) { onDone?.(); return; }
    // 调试：面板隐藏时 rAF 暂停，?debug 下可直接让兆长全
    const stop = piece.showFront({ crack, spot, other, otherSpot, delay, reduced: ctx.reduced, onDone });
    return () => { stop(); piece.showBack(); };
  });
</script>
