<script>
  // 摇签：签筒摆在桌上，仿真签筒 + 摇动控制（docs/DESIGN.md §6）。签落地后，桌上多出一支签条：签号、签名与签级；
  // 签诗与解签不在这里念，写进命书里。
  import Spread from '../../core/Spread.svelte';
  import { signNo } from './game.svelte.js';

  let { ctx, game } = $props();
  const { S, db, shake } = game;

  // 器物在桌上，由 Codex 渲染：用动作把签筒与摇动控制接上
  function rig(button) {
    const svg = button.querySelector('svg');
    const off = game.attachTube(svg);
    const unbind = shake.bind(button);
    return { destroy() { unbind(); off(); } };
  }

  const noteNow = $derived(!shake.hasMotion
    ? '按住桌上的签筒左右拖着摇；只按住不动，它也会自己轻轻摇。不用鼠标：Tab 聚焦签筒，按住空格（或回车）它就摇，松开签就落。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住签筒左右拖着摇吧。不用触屏：Tab 聚焦签筒，按住空格也行。'
      : '拿起手机晃一晃，签会自己跳出来。也可以按住签筒左右拖，或 Tab 聚焦签筒后按住空格。');
  // 签一出筒，提示就不再变了；签落下来后换成下一步的提示
  let frozen = $state('');
  $effect(() => { if (!S.sign) frozen = noteNow; });
  const note = $derived(S.signShown ? '签落下来了。点下面的“掷筊请示”，问问神明这支签算不算数。签上的诗与解，我写进命书里。' : (S.sign ? frozen : noteNow));
</script>

{#snippet desk()}
  <div class="tube-wrap" id="tube-wrap">
    <button class="tube" id="tube" use:rig aria-label="签筒：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
      <svg id="qian-svg" aria-hidden="true"></svg>
    </button>
  </div>
  {#if S.signShown && S.sign}
    {@const sign = S.sign}
    <div class="sign-slip" id="sign" aria-label={`得签：${signNo(sign)}，${sign.name}，${sign.level}`}>
      <span class="sl-no">{signNo(sign)}</span>
      <b class="sl-name" id="sign-name">{sign.name}</b>
      <span class="sl-level" id="sign-level" data-tone={db.levels[sign.level]}>{sign.level}</span>
    </div>
  {/if}
{/snippet}

<Spread hint={note} {desk}>
  {#snippet act()}
    {#if S.signShown && S.sign}<button class="btn btn-primary" id="btn-to-jiao" onclick={game.enterJiao}>掷筊请示</button>{/if}
  {/snippet}
</Spread>
