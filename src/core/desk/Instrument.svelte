<script>
  // 书桌上的器物（写意的静态画，SVG）：签筒（签）、龟壳与三枚铜钱（卦）、龟甲（卜）、星盘（星）、鸟笼（鸟）、砚与笺（字）、历书（历）。
  // 首页的书桌与各卷入口屏的桌面都用它；真正的摇、掷、灼用各卷自己的器物（签筒 tube.js、龟壳 shell.js、龟甲 Plastron.svelte）。
  // 颜色取自桌上的夜里配色（--obj-*）与木色，不论昼夜都一样。
  import { createQian } from '../../juan/qian/tube.js';
  let { id } = $props();
  function inkTube(node) {
    const svg = node.ownerSVGElement;
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    createQian(holder, {});
    svg.setAttribute('viewBox', '0 0 320 440');
    node.append(...holder.childNodes);
  }
</script>

<svg class="inst inst-{id}" viewBox="0 0 200 200" aria-hidden="true">
  {#if id === 'qian'}
    <!-- 签筒只有一种画法：与摇签时的水墨签筒是同一张（tube.js 画一帧，不起物理） -->
    <g use:inkTube></g>
  {:else if id === 'gua'}
    <defs>
      <radialGradient id="in-gs" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#8c6a3c"/><stop offset=".7" stop-color="#4c3a20"/><stop offset="1" stop-color="#2b2010"/></radialGradient>
      <radialGradient id="in-gc" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d7b46a"/><stop offset="1" stop-color="#7d5c27"/></radialGradient>
    </defs>
    <ellipse cx="100" cy="150" rx="86" ry="14" fill="#000" opacity=".35"/>
    <path d="M18 120 Q22 38 100 34 Q178 38 182 120 Q100 150 18 120 Z" fill="url(#in-gs)"/>
    <g fill="none" stroke="#1f160a" stroke-width="1.6" opacity=".75">
      <path d="M100 36 L100 128"/><path d="M60 46 L66 126"/><path d="M140 46 L134 126"/><path d="M28 84 Q100 98 172 84"/><path d="M24 104 Q100 120 176 104"/>
    </g>
    {#each [[62, 150], [100, 160], [140, 148]] as [x, y]}
      <g transform="translate({x} {y})">
        <ellipse cx="0" cy="4" rx="21" ry="6" fill="#000" opacity=".35"/>
        <circle r="20" fill="url(#in-gc)" stroke="#5a3f17" stroke-width="2"/>
        <circle r="15.5" fill="none" stroke="#5a3f17" stroke-width="1" opacity=".6"/>
        <rect x="-5" y="-5" width="10" height="10" fill="#1d150a" stroke="#5a3f17" stroke-width="1.2"/>
      </g>
    {/each}
  {:else if id === 'bu'}
    <defs>
      <radialGradient id="in-bp" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#d9c99a"/><stop offset=".8" stop-color="#a3925e"/><stop offset="1" stop-color="#6f6038"/></radialGradient>
    </defs>
    <ellipse cx="100" cy="176" rx="76" ry="9" fill="#000" opacity=".35"/>
    <path d="M100 18 Q168 30 166 100 Q160 166 100 176 Q40 166 34 100 Q32 30 100 18 Z" fill="url(#in-bp)"/>
    <g fill="none" stroke="#5b4d28" stroke-width="2" opacity=".8">
      <path d="M100 20 L100 174"/><path d="M40 70 L160 70"/><path d="M36 108 L164 108"/><path d="M46 144 L154 144"/>
    </g>
    <g fill="#4a3d1e" opacity=".85">
      {#each [[78, 50], [122, 50], [74, 90], [126, 90], [78, 126], [122, 126]] as [x, y]}
        <circle cx={x} cy={y} r="5"/>
      {/each}
    </g>
    <g fill="none" stroke="#2c230f" stroke-width="1.6" stroke-linecap="round" opacity=".7"><path d="M122 50 L146 50 M134 50 L138 40"/><path d="M78 90 L56 90 M66 90 L62 80"/></g>
  {:else if id === 'xing'}
    <circle cx="100" cy="102" r="86" fill="#000" opacity=".3"/>
    <circle cx="100" cy="98" r="84" fill="#7d6a3a" stroke="#c3a965" stroke-width="3"/>
    <circle cx="100" cy="98" r="72" fill="#2c2618" stroke="#c3a965" stroke-width="1.5"/>
    <g stroke="#c3a965" stroke-width="1.2">
      {#each Array.from({ length: 28 }) as _, i}
        <line x1={100 + 72 * Math.cos((i * Math.PI * 2) / 28)} y1={98 + 72 * Math.sin((i * Math.PI * 2) / 28)} x2={100 + 62 * Math.cos((i * Math.PI * 2) / 28)} y2={98 + 62 * Math.sin((i * Math.PI * 2) / 28)}/>
      {/each}
    </g>
    <circle cx="100" cy="98" r="44" fill="none" stroke="#c3a965" stroke-width="1.2"/>
    <path d="M100 98 m-44 0 a44 44 0 0 1 88 0 M62 120 Q100 70 138 76" fill="none" stroke="#c3a965" stroke-width="1.4"/>
    <g fill="#e2d0a0"><circle cx="78" cy="80" r="2.4"/><circle cx="118" cy="70" r="2"/><circle cx="130" cy="112" r="2.6"/><circle cx="92" cy="124" r="1.8"/><circle cx="108" cy="96" r="2.2"/></g>
    <path d="M100 98 L168 54" stroke="#c3a965" stroke-width="3" stroke-linecap="round"/>
    <circle cx="100" cy="98" r="6" fill="#c3a965"/>
    <path d="M100 14 q8 -10 16 0" fill="none" stroke="#c3a965" stroke-width="3"/>
  {:else if id === 'niao'}
    <ellipse cx="100" cy="182" rx="62" ry="8" fill="#000" opacity=".35"/>
    <ellipse cx="100" cy="170" rx="58" ry="12" fill="#4a3720" stroke="#2a1d0e" stroke-width="2"/>
    <g fill="none" stroke="#c0a36a" stroke-width="2.2" stroke-linecap="round">
      <path d="M44 168 Q42 70 100 46 Q158 70 156 168"/>
      <path d="M62 170 Q62 82 100 46"/><path d="M80 172 Q82 90 100 46"/><path d="M100 172 L100 46"/><path d="M120 172 Q118 90 100 46"/><path d="M138 170 Q138 82 100 46"/>
      <path d="M47 130 Q100 142 153 130"/><path d="M50 96 Q100 106 150 96"/>
      <path d="M100 46 L100 26"/><circle cx="100" cy="20" r="7"/>
    </g>
    <path d="M70 140 L130 140" stroke="#8a6a3a" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M92 138 q-2 -22 12 -24 q14 2 12 22 z" fill="#9a8f70"/>
  {:else if id === 'zi'}
    <ellipse cx="100" cy="176" rx="78" ry="9" fill="#000" opacity=".35"/>
    <rect x="22" y="104" width="86" height="64" rx="8" fill="#26231e" stroke="#575046" stroke-width="2.5"/>
    <ellipse cx="62" cy="128" rx="28" ry="14" fill="#07070a"/>
    <path d="M118 150 L176 70" stroke="#6b4c28" stroke-width="5" stroke-linecap="round"/>
    <path d="M176 70 l8 -12 l-3 14 z" fill="#1b1712"/>
    <rect x="112" y="116" width="62" height="52" rx="2" fill="#e6dcc0" transform="rotate(6 143 142)"/>
    <path d="M128 132 L158 130 M142 124 L140 156 M128 148 L156 150" stroke="#1b1712" stroke-width="3" stroke-linecap="round" opacity=".8" transform="rotate(6 143 142)"/>
  {:else if id === 'li'}
    <ellipse cx="100" cy="182" rx="66" ry="8" fill="#000" opacity=".35"/>
    <rect x="46" y="48" width="108" height="130" rx="4" fill="#d8ccaa" stroke="#6f6244" stroke-width="2"/>
    <rect x="46" y="48" width="108" height="26" rx="4" fill="#3b342a"/>
    <g fill="#e8dcb8"><circle cx="74" cy="48" r="4"/><circle cx="126" cy="48" r="4"/></g>
    <g stroke="#6f6244" stroke-width="1.2" opacity=".75">
      {#each [92, 108, 124, 140, 156] as y}<line x1="56" y1={y} x2="144" y2={y}/>{/each}
      {#each [78, 100, 122] as x}<line x1={x} y1="82" x2={x} y2="170"/>{/each}
    </g>
    <text x="100" y="68" text-anchor="middle" font-size="16" font-family="var(--f-display)" fill="#d8ccaa">历</text>
    <path d="M154 150 q10 4 8 18 l-8 4 z" fill="#c4b890" stroke="#6f6244" stroke-width="1.2"/>
  {/if}
</svg>

<style>
  .inst { display: block; width: 100%; height: auto; overflow: visible; }
</style>
