<script>
  // 龟腹甲的背面：预先凿好六处钻凿。按住一处，炭火渐红、冒烟，到时“卜”的一声。
  // 水墨写意的画法，动起来是真实的物理：烟有浮力、受风、越升越散；炭火的红是低饱和的赭红，不是朱。
  import { onMount } from 'svelte';
  import { SPOTS, cnNum } from './data.js';

  let { ctx, game } = $props();
  const { S } = game;
  let box;
  let canvas;
  let parts = [];
  let raf = 0;
  let last = 0;
  let acc = 0;
  let wind = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const HEATC = '168,84,52';
  const px = () => canvas.clientWidth / 300;

  function spawn(x, y, n, power) {
    for (let i = 0; i < n; i++) {
      parts.push({ x: x + rand(-3, 3), y: y + rand(-2, 2), vx: rand(-5, 5), vy: -rand(22, 38) * power, r: rand(3.5, 6), age: 0, life: rand(2.2, 3.4), a: rand(0.22, 0.34) * Math.min(1, power) });
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    raf = requestAnimationFrame(frame);
    step(dt, now);
  }

  // 推进一帧：生成、受力、绘制。面板隐藏时 rAF 暂停，调试用 window.__buSmoke.step(dt) 手动推进
  function step(dt, now = performance.now()) {
    const k = px();
    const g = canvas.getContext('2d');
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(canvas.clientWidth * d)) { canvas.width = Math.round(canvas.clientWidth * d); canvas.height = Math.round(canvas.clientHeight * d); }
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const spot = S.active >= 0 ? SPOTS[S.active] : null;
    if (spot && S.heat > 0.04) {
      acc += dt * (5 + 26 * S.heat);
      while (acc >= 1) { acc -= 1; spawn(spot.x * k, (spot.y - 4) * k, 1, 0.6 + S.heat); }
    }
    wind = Math.sin(now * 0.0007) * 10 + Math.sin(now * 0.0019) * 5; // 屋里有一点气流
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      const shear = Math.sin(p.y * 0.035 + p.age * 1.6) * 7; // 越往上，越被卷着扭
      p.vx += ((wind + shear) * (0.4 + p.age * 0.4) - p.vx) * Math.min(1, 1.4 * dt);
      p.vy *= 1 - 0.28 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += (9 + p.age * 4) * dt;
      const u = p.age / p.life;
      const a = p.a * Math.min(1, p.age * 4) * (1 - u) ** 1.6;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      gr.addColorStop(0, `rgba(54,48,42,${a.toFixed(3)})`);
      gr.addColorStop(1, 'rgba(54,48,42,0)');
      g.fillStyle = gr;
      g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    return parts.length > 0 || (spot && S.heat > 0.04);
  }

  function ensureLoop() {
    if (raf || ctx.reduced) return;
    last = 0;
    raf = requestAnimationFrame((n) => { frame(n); });
  }

  // 炭火的噼啪
  let crackTimer = 0;
  function spit() {
    crackTimer = setTimeout(() => {
      if (S.active >= 0 && S.heat > 0.1) ctx.sfx.clack(0.12 + 0.2 * S.heat);
      spit();
    }, 260 + Math.random() * 520);
  }

  onMount(() => {
    const off = game.registerPlastron({
      puff() { const s = SPOTS[S.active] ?? SPOTS[0]; spawn(s.x * px(), s.y * px(), 16, 1.6); ensureLoop(); },
    });
    if (location.search.includes('debug')) window.__buSmoke = { step, get n() { return parts.length; } };
    spit();
    // 一直在跑会白耗电：没有烟、没有火时停掉
    const watch = setInterval(() => {
      if (S.active >= 0 || parts.length) ensureLoop();
      else if (raf) { cancelAnimationFrame(raf); raf = 0; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); }
    }, 120);
    return () => { off(); clearTimeout(crackTimer); clearInterval(watch); cancelAnimationFrame(raf); raf = 0; };
  });

  $effect(() => { if (S.active >= 0) ensureLoop(); });

  /* 输入：指针按住、键盘按住空格或回车 */
  function down(e, i) {
    if (S.used[i]) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    game.pressStart(i);
  }
  const move = (e) => { if (S.active >= 0) game.pressMove(e.movementX, e.movementY); };
  const up = () => game.pressEnd();
  function kd(e, i) {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !S.used[i]) { e.preventDefault(); game.pressStart(i); }
  }
  function ku(e) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); game.pressEnd(); }
  }

  // 对贞：只能灼与正问左右对称的那一处（它已用过则不限）
  const off = (i) => S.nextKind === 'fan' && game.mirrorSpot() >= 0 && i !== game.mirrorSpot();
  const spot = $derived(S.active >= 0 ? SPOTS[S.active] : null);
  const heat = $derived(S.heat);
</script>

<div class="plastron" bind:this={box}>
  <svg viewBox="0 0 300 420" class="plastron-svg" aria-hidden="true">
    <defs>
      <radialGradient id="bu-heat" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color={`rgb(${HEATC})`} stop-opacity=".9" />
        <stop offset=".45" stop-color={`rgb(${HEATC})`} stop-opacity=".35" />
        <stop offset="1" stop-color={`rgb(${HEATC})`} stop-opacity="0" />
      </radialGradient>
      <linearGradient id="bu-bone" x1="0" y1="0" x2=".6" y2="1">
        <stop offset="0" stop-color="#cdbb94" />
        <stop offset=".6" stop-color="#c2af87" />
        <stop offset="1" stop-color="#b9a47b" />
      </linearGradient>
      <linearGradient id="bu-coal" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#1c1814" />
        <stop offset=".6" stop-color="#2b2520" />
        <stop offset="1" stop-color="#14110e" />
      </linearGradient>
    </defs>
    <!-- 甲：外轮廓与中缝（背面比正面粗糙） -->
    <path class="shell-body" filter="url(#bu-rough)" fill="url(#bu-bone)"
      d="M150 14 C205 14 252 40 262 96 C270 140 258 176 266 214 C274 260 262 318 244 356 C226 394 188 408 150 408 C112 408 74 394 56 356 C38 318 26 260 34 214 C42 176 30 140 38 96 C48 40 95 14 150 14 Z" />
    <!-- 骨面的深浅：几团淡墨晕 -->
    <g filter="url(#bu-soft)" opacity=".9">
      <ellipse cx="96" cy="86" rx="62" ry="38" fill="#6a5030" opacity=".1" />
      <ellipse cx="214" cy="170" rx="54" ry="46" fill="#f3e8cc" opacity=".22" />
      <ellipse cx="90" cy="250" rx="52" ry="40" fill="#6a5030" opacity=".09" />
      <ellipse cx="210" cy="330" rx="58" ry="34" fill="#6a5030" opacity=".1" />
      <ellipse cx="130" cy="372" rx="70" ry="22" fill="#4a3620" opacity=".1" />
    </g>
    <g class="shell-lines" fill="none" stroke="#1b1712" stroke-linecap="round" filter="url(#bu-rough)">
      <path d="M150 14 C153 90 147 160 151 214 C154 280 148 350 150 408" stroke-width="1.6" opacity=".5" />
      <path d="M44 160 C80 154 118 158 148 164" stroke-width="1.1" opacity=".26" />
      <path d="M256 160 C220 154 182 158 152 164" stroke-width="1.1" opacity=".26" />
      <path d="M52 262 C86 268 120 266 148 272" stroke-width="1.1" opacity=".26" />
      <path d="M248 262 C214 268 180 266 152 272" stroke-width="1.1" opacity=".26" />
      <path d="M150 14 C205 14 252 40 262 96 C270 140 258 176 266 214 C274 260 262 318 244 356 C226 394 188 408 150 408 C112 408 74 394 56 356 C38 318 26 260 34 214 C42 176 30 140 38 96 C48 40 95 14 150 14 Z"
        stroke-width="2.4" opacity=".62" stroke-dasharray="220 3 120 2 300 4" />
    </g>
    <!-- 钻凿：一个圆孔（钻）和一道长槽（凿），成对 -->
    {#each SPOTS as s, i}
      <g class="drill" class:is-used={S.used[i]} transform={`translate(${s.x} ${s.y})`}>
        {#if S.used[i]}
          <circle r="15" fill="#2e1d10" opacity=".34" filter="url(#bu-rough)" />
        {/if}
        <ellipse cx={s.x < 150 ? 11 : -11} cy="0" rx="3.6" ry="9" fill="#2a2018" opacity=".62" transform={`rotate(${s.x < 150 ? -8 : 8} ${s.x < 150 ? 11 : -11} 0)`} />
        <circle r="6.4" fill="#2a2018" opacity=".82" filter="url(#bu-rough)" />
        <circle r="6.4" fill="none" stroke="#1b1712" stroke-width="1.2" opacity=".6" />
        {#if !S.used[i]}<text class="drill-no" y="26" text-anchor="middle">{cnNum(i + 1)}</text>{/if}
      </g>
    {/each}
    <!-- 炭火：赭红的余烬，随热度变亮 -->
    {#if spot}
      <circle cx={spot.x} cy={spot.y} r={12 + 30 * heat} fill="url(#bu-heat)" opacity={0.25 + 0.75 * heat} />
      <g transform={`translate(${spot.x} ${spot.y}) scale(${spot.x < 150 ? -1 : 1} 1)`}>
        <g transform="rotate(-38) translate(5 -4)">
          <rect x="0" y="-5.5" width="62" height="11" rx="4.5" fill="url(#bu-coal)" filter="url(#bu-rough)" />
          <rect x="0" y="-5.5" width="62" height="11" rx="4.5" fill="none" stroke="#0e0c0a" stroke-width=".8" opacity=".6" />
          <rect x="-3" y="-6.2" width="22" height="12.4" rx="5" fill={`rgb(${HEATC})`} opacity={0.15 + 0.85 * heat} filter="url(#bu-rough)" />
          <circle cx="2" cy="0" r={3 + 4 * heat} fill="#f0c9a0" opacity={heat * 0.6} />
        </g>
      </g>
    {/if}
  </svg>
  <canvas class="smoke" bind:this={canvas} aria-hidden="true"></canvas>
  {#each SPOTS as s, i}
    <button
      class="spot"
      class:is-used={S.used[i]}
      class:is-active={S.active === i}
      class:is-off={off(i)}
      style={`left:${(s.x / 300) * 100}%;top:${(s.y / 420) * 100}%`}
      disabled={S.used[i] || (S.phase !== 'pick') || off(i)}
      aria-label={`第${cnNum(i + 1)}处钻凿，按住来灼${S.used[i] ? '（已灼）' : ''}`}
      onpointerdown={(e) => down(e, i)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      oncontextmenu={(e) => e.preventDefault()}
      onkeydown={(e) => kd(e, i)}
      onkeyup={ku}
    ></button>
  {/each}
</div>
