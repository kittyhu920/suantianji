<script>
  // 结局坦白：旁批里的数字是怎么从你身上算出来的。通灵返回后，大师细看的实话放在最前（ai）。
  import Note from '../Note.svelte';
  let { items = [] } = $props();
</script>

{#if items.length}
  <section class="confess" id="confess-box" aria-labelledby="cf-h">
    <h3 id="cf-h">跟你说几句实话</h3>
    <ul id="confess">
      {#each items as it}<li class={it.ai ? 'from-ai' : ''}>{#if it.ai}<Note text={it.text} />{:else}{it.text}{/if}</li>{/each}
    </ul>
  </section>
{/if}
