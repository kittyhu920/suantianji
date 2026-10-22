<script>
  // 印章按钮：朱色只给印章。size：sm / md / lg
  let { size = 'md', class: cls = '', children, ...rest } = $props();
</script>

<button class={`seal seal-${size} ${cls}`.trim()} {...rest}><span>{@render children?.()}</span></button>
