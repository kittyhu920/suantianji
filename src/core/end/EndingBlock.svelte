<script>
  // 四态结局的公共部分：印 + 结局名 + 一句引语 + 判词 + 转折句。
  // 四态是遵 / 逆 / 破 / 迷（zun / ni / po / mi），各卷用自己的民俗规矩触发，见 docs/DESIGN.md。
  import InkLine from '../InkLine.svelte';
  import { inview } from '../inview.js';

  let { ctx, ending, lead, turn = [] } = $props();
  const offsets = $derived(turn.map((_, i) => turn.slice(0, i).reduce((n, l) => n + [...l].length, 0)));
</script>

<span class="page-seal" aria-hidden="true"><span>{ending.name[0]}</span></span>
<hr class="ink-rule" aria-hidden="true">
<header class="ending-head">
  <span class="seal seal-md" aria-hidden="true" use:inview={{ ctx, kind: 'stamp' }}><span id="e-seal">{ending.name[0]}</span></span>
  <div>
    <h2 id="e-name" class="ending-name">{ending.name}</h2>
    <p class="ending-sub" id="e-sub">{ending.sub}</p>
  </div>
</header>
<p class="ending-lead" id="e-lead">{lead}</p>
<div class="poem poem-end" id="e-verse" use:inview={{ ctx, kind: 'ink' }}>
  {#each ending.verse as line, i}<span><InkLine text={line} start={i * [...line].length * 70} step={70} /></span>{/each}
</div>
<p class="turn" use:inview={{ ctx, kind: 'ink' }}>
  {#each turn as line, i}{#if i}<br>{/if}<InkLine text={line} start={300 + offsets[i] * 90} step={90} />{/each}
</p>
