<script>
  // 观象：结局、坦白（含莱布尼茨与先天八卦图）、行为账本、命盘、四种结局。结局之后的“再起一卦”回到问事。
  import EndingBlock from '../../core/end/EndingBlock.svelte';
  import Confess from '../../core/end/Confess.svelte';
  import Ledger from '../../core/end/Ledger.svelte';
  import LoomFigure from '../../core/end/LoomFigure.svelte';
  import EndingsList from '../../core/end/EndingsList.svelte';
  import Zhu from '../../core/Zhu.svelte';
  import Hexagram from './Hexagram.svelte';
  import { afterChange, xiantianValue, CN_YAO_SHORT } from './yao.js';
  import { BINARY } from './words.js';
  import { loomStyle } from './loom-style.js';

  let { ctx, game } = $props();
  const { S, db } = game;

  // 屏一挂上，这一局的结果就定了；之后“再来一局”清空状态时，这一屏不跟着变
  const e = $state.snapshot(S.end);
  const cast = game.lastCast() && $state.snapshot(game.lastCast());
  const hex = cast?.hex;
  const changed = cast?.changed;
  const vs = cast?.lines.map((l) => l.v) ?? [];
  const domain = S.domain && db.domains[S.domain];
  const throws = $state.snapshot(S.throws);
  const ending = db.endings[e.endKey];
  const bits = cast?.bin ?? '';
  const value = cast ? xiantianValue(cast.bin) : 0;
  const caption = throws.length
    ? `这幅图由你刚才的 ${e.fields} 项操作数据生成，每个人都不一样。编号 ${e.seed.toString(16).padStart(8, '0')}`
    : '一次也没掷，所以什么也没织出来。空白，也是一种回答。';
</script>

<section class="screen screen-end is-active" data-screen="end" aria-labelledby="e-name">
  <div class="end-cols">
    <div class="end-col">
      {#if cast}
        <p class="cups-pair" id="cast-pair">{hex.name}{#if changed} → {changed.name}{/if}<small>{changed ? '有变爻，本卦之变卦' : '没有变爻'}</small></p>
        <article class="jieqian" id="jiegua-end" aria-labelledby="jg-h">
          <h3 id="jg-h">解卦</h3>
          <div class="end-figs">
            <Hexagram lines={vs} size={96} seed={S.casts.length} label="本卦" />
            {#if changed}<Hexagram lines={afterChange(vs)} size={96} seed={S.casts.length + 9} label="变卦" marks={false} />{/if}
          </div>
          <p class="jq-title"><span>{hex.name}　{hex.lower}下{hex.upper}上</span></p>
          <p class="jq-row"><b>卦辞</b><span>{hex.ci}</span></p>
          <p class="jq-row"><b>这一卦在说什么</b><span>{hex.bai}</span></p>
          {#if domain}<p class="jq-row"><b>关于{domain.desc}</b><span>{hex.advice[S.domain]}</span></p>{/if}
        </article>
        <section class="binary" aria-labelledby="bn-h">
          <h3 id="bn-h">{BINARY.title}</h3>
          <p class="binary-lead">{BINARY.lead}</p>
          <ol class="bits" aria-label="六位二进制，自下而上">
            {#each [...bits] as b, i}<li class:is-yang={b === '1'}><small>{CN_YAO_SHORT[i]}</small><span>{b}</span></li>{/each}
          </ol>
          <p class="binary-eq">自下而上读作 <b>{bits}</b>，初爻为最低位，是十进制的 <b>{value}</b>。</p>
          <p>{BINARY.p1(bits, value)}</p>
          <p>{BINARY.p2[0]}<Zhu term="先天八卦">{BINARY.p2[1]}</Zhu>{BINARY.p2[2]}<Zhu term="莱布尼茨">{BINARY.p2[3]}</Zhu>{BINARY.p2[4]}<Zhu term="二进制">{BINARY.p2[5]}</Zhu>{BINARY.p2[6]}</p>
          <p>{BINARY.p3}</p>
          <p>{BINARY.p4}</p>
        </section>
      {:else}
        <p class="cups-pair" id="cast-pair">还没起卦<small>钱还没有掷出去</small></p>
      {/if}
      <EndingBlock {ctx} {ending} lead={ending.lead} turn={['不过，在你起卦的时候，', '我也在给你算命。']} />
    </div>

    <div class="end-col">
      <Confess items={game.confessItems()} />
      <p class="critique" id="e-critique">{ending.critique}</p>
      <Ledger rows={game.ledgerRows()} />
      <LoomFigure {ctx} seed={e.seed} {throws} {caption} style={loomStyle}>
        <p class="loom-legend">每掷一次，织一束丝：少阳的丝平直，少阴的丝在中间分开；<span>老阳的丝胀成一个圈，老阴的丝在中间交叉</span>，它们是变爻，丝里带一点朱；被你弃掉的那一卦，颜色淡些。</p>
      </LoomFigure>
      <EndingsList endings={db.endings} got={e.got} current={e.endKey} />
      <div class="end-actions">
        {#if cast}<button class="btn btn-primary" id="btn-poster" onclick={() => { game.posterOpen = true; }}>保存这一卦</button>{/if}
        <button class="btn" id="btn-again" onclick={game.again}>再起一卦</button>
      </div>
      <a class="about-link" href="/about/">关于这件作品</a>
    </div>
  </div>
</section>
