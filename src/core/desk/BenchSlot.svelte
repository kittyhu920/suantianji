<script>
  // 按钮槽：这一步的主操作，摆在桌面下方的中央，紧挨着器物（原来在页脚右下角，离手要操作的东西太远）。
  // 屏用 <Spread {act}> 交进来，Codex 在仪式时把它渲染在这里；样式见 styles/foot.css 的 .bench-slot。
  // 里面可以是一枚朱印、一个主按钮，或两个分量相同的“二选一”按钮（.btn-pair）。
  // hero：入口屏，朱印放大、居中、成为焦点（见 styles/foot.css 的 .is-hero）
  let { children, hero = false } = $props();
</script>

<div class="bench-slot" class:is-hero={hero} role="group" aria-label="这一步的操作">
  {@render children()}
</div>
