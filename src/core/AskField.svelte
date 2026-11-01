<script>
  // 问事的输入：在纸笺上写字。三卷共用。没有方框，纸上三行淡墨的行线，字是楷书墨色；
  // 高度固定为三行（不随字数跳），超出三行时静默滚动、不露滚动条；聚焦时行线加深。样式见 core/styles/desk.css 的 .ask-paper。
  let { value = $bindable(''), max = 40, placeholder = '', label = '', onkeydown } = $props();
</script>

<label class="ask-field">
  <span class="ask-label">{label}</span>
  <textarea class="ask-paper" id="ask" rows="3" maxlength={max} autocomplete="off" autocapitalize="off" spellcheck="false" {placeholder} bind:value {onkeydown}></textarea>
</label>
<span class="ask-count" aria-hidden="true">{[...value].length} / {max}</span>
