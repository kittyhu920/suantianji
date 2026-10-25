<script>
  // 摇签：签筒摆在桌上，仿真签筒 + 摇动控制（docs/DESIGN.md §6）。签落地后，桌上多出一支签条：签号、签名与签级；
  // 签诗与解签不在这里念，写进命书里。
  import Spread from '../../core/Spread.svelte';
  import { signNo } from './game.svelte.js';
  import { deskState, deskRef, slot } from '../../core/scene/desk.svelte.js';

  let { ctx, game } = $props();
  const { S, db, shake } = game;

  // 器物在桌上，由 Codex 渲染：用动作把签筒与摇动控制接上
  // 3D 书桌：签筒是桌上的 3D 物件，按钮只是它的替身（键盘与读屏），指针由画布拾取后转给它；物理照旧，画面由 3D 负责
  function rig(button) {
    const piece = deskState.on ? deskRef.pieces?.list.qian : null;
    const svg = button.querySelector('svg') ?? document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const off = game.attachTube(svg, piece?.view);
    const unbind = shake.bind(button);
    const onFocus = () => piece?.glow?.(1);
    const onBlur = () => piece?.glow?.(0);
    if (piece) { piece.proxy = () => button; button.addEventListener('focus', onFocus); button.addEventListener('blur', onBlur); }
    return {
      destroy() {
        unbind(); off();
        if (piece) { piece.proxy = null; button.removeEventListener('focus', onFocus); button.removeEventListener('blur', onBlur); }
      },
    };
  }

  const noteNow = $derived(!shake.hasMotion
    ? '按住桌上的签筒左右拖着摇；只按住不动，它也会自己轻轻摇。'
    : shake.motion === 'denied'
      ? '没有得到晃动手机的许可，就按住签筒左右拖着摇吧。'
      : '拿起手机晃一晃，签会自己跳出来。也可以按住签筒左右拖。');
  // 签一出筒，提示就不再变了；签落下来后换成下一步的提示
  let frozen = $state('');
  $effect(() => { if (!S.sign) frozen = noteNow; });
  const note = $derived(S.signShown ? '签落下来了。点右下角的“掷筊请示”，问问神明这支签算不算数。签上的诗与解，我写进命书里。' : (S.sign ? frozen : noteNow));
</script>

{#snippet desk()}
  {#if deskState.on}
    <div class="piece-slot is-qian" id="tube-wrap" use:slot={{ id: 'qian', at: [0.5, 0.5] }}>
      <button class="tube proxy" id="tube" use:rig aria-label="签筒：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃"></button>
    </div>
  {:else}
    <div class="tube-wrap" id="tube-wrap">
      <button class="tube" id="tube" use:rig aria-label="签筒：按住左右拖动来摇，或按住不动让它自己摇；手机可以直接晃">
        <svg id="qian-svg" aria-hidden="true"></svg>
      </button>
    </div>
  {/if}
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
  {#snippet foot()}
    {#if S.signShown && S.sign}<button class="btn btn-primary" id="btn-to-jiao" onclick={game.enterJiao}>掷筊请示</button>{/if}
  {/snippet}
</Spread>
