// 墨与水：盖在画心上的一层画布（docs/DESIGN.md §8）
// 画面静止时什么都不画、rAF 也不跑；只有点按、换屏、落签这些时刻才有水或墨出现，随后淡去。
// 质感取"水洇在宣纸上"：边缘柔和的淡墨晕 + 细而淡的水纹。不画放射的细线，不画吊着的线。
//
//   ripple  水纹：一圈圈扩散的细环
//   wash    墨晕：几团互相错开的柔边淡墨，慢慢洇开、淡去，像水滴在宣纸上
//   spatter 溅点：几粒细小的墨点向四周弹开，滑行一段后停住
//   fall    落滴：从上方落下一滴，触纸即洇开（通灵等待用）
//   splash  点按：一小团墨晕 + 两圈水纹

const TAU = Math.PI * 2;
const INK = [27, 23, 18];
const ZHU = [179, 38, 31];
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = (t) => 1 - (1 - t) ** 3;
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

export const COLOR = { ink: INK, zhu: ZHU };

const NOOP = {
  ripple() {}, wash() {}, spatter() {}, fall() {}, splash() {}, clear() {}, destroy() {}, advance() { return false; },
  get busy() { return false; },
};

export function createInk(canvas, { reduced = false } = {}) {
  if (reduced || !canvas.getContext) return NOOP;
  const g = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  const items = [];
  let raf = 0;
  let last = 0;
  let dead = false;

  function fit() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w === W && h === H && d === dpr) return true;
    W = w; H = h; dpr = d;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    g.setTransform(d, 0, 0, d, 0, 0);
    return true;
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { fit(); }) : null;
  ro?.observe(canvas);

  function add(it) {
    if (dead || !fit()) return;
    it.age = 0;
    items.push(it);
    if (!raf && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    if (dead) { raf = 0; return; }
    raf = requestAnimationFrame(frame); // 先排下一帧：帧内新增的效果看到 raf 非零，就不会再开一条循环
    const dt = Math.max(0, Math.min(0.05, (now - (last || now)) / 1000));
    last = now;
    if (!advance(dt)) { cancelAnimationFrame(raf); raf = 0; }
  }

  // 推进并重画一帧；还有东西在动就返回 true（调试时可直接调，不依赖 rAF）
  function advance(dt) {
    g.clearRect(0, 0, W, H);
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.age += dt;
      if (it.step(dt) === false) items.splice(i, 1);
      else it.draw();
    }
    return items.length > 0;
  }

  /* ───── 水纹 ───── */
  function ripple(x, y, { color = INK, r = 40, rings = 2, dur = 1.25, a = 0.22, lw = 1.1 } = {}) {
    const gap = 0.26;
    add({
      step() { return this.age < dur + (rings - 1) * gap; },
      draw() {
        for (let k = 0; k < rings; k++) {
          const t = (this.age - k * gap) / dur;
          if (t <= 0 || t >= 1) continue;
          g.lineWidth = lw * (1 - t * 0.5);
          g.strokeStyle = rgba(color, a * (1 - t) ** 2 * (k ? 0.6 : 1));
          g.beginPath();
          g.ellipse(x, y, r * easeOut(t), r * easeOut(t) * 0.94, 0, 0, TAU);
          g.stroke();
        }
      },
    });
  }

  /* ───── 墨晕 ───── */
  // 三团柔边的圆互相错开，叠出不规则又圆润的一片；每团由中心向外渐淡，没有硬边
  function wash(x, y, { color = INK, R = 22, a = 0.16, grow = 1.0, hold = 0.5, fade = 1.7 } = {}) {
    const lobes = Array.from({ length: 3 }, () => ({
      dx: rand(-0.22, 0.22) * R, dy: rand(-0.22, 0.22) * R, k: rand(0.72, 1),
    }));
    add({
      step() { return this.age < grow + hold + fade; },
      draw() {
        const e = easeOut(Math.min(1, this.age / grow));
        const fadeK = this.age < grow + hold ? 1 : 1 - (this.age - grow - hold) / fade;
        const rise = Math.min(1, this.age / 0.12); // 刚落下时迅速浮现
        for (const l of lobes) {
          const r = R * l.k * (0.25 + 0.75 * e);
          const cx = x + l.dx * e;
          const cy = y + l.dy * e;
          const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          const al = a * fadeK * rise;
          gr.addColorStop(0, rgba(color, al));
          gr.addColorStop(0.55, rgba(color, al * 0.55));
          gr.addColorStop(1, rgba(color, 0));
          g.fillStyle = gr;
          g.beginPath();
          g.arc(cx, cy, r, 0, TAU);
          g.fill();
        }
      },
    });
  }

  /* ───── 溅点 ───── */
  function spatter(x, y, { color = INK, n = 6, power = 1, size = 1 } = {}) {
    const dots = Array.from({ length: n }, () => {
      const ang = rand(0, TAU);
      const sp = rand(70, 240) * power;
      return { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: rand(0.7, 2.2) * size };
    });
    add({
      step(dt) {
        for (const d of dots) {
          d.x += d.vx * dt; d.y += d.vy * dt;
          const f = Math.exp(-5.5 * dt);
          d.vx *= f; d.vy *= f;
        }
        return this.age < 2.6;
      },
      draw() {
        const k = this.age < 0.9 ? 1 : 1 - (this.age - 0.9) / 1.7;
        g.fillStyle = rgba(color, 0.45 * k);
        for (const d of dots) { g.beginPath(); g.arc(d.x, d.y, d.r, 0, TAU); g.fill(); }
      },
    });
  }

  /* ───── 落滴：一颗墨珠（可先悬挂鼓起一会儿），坠下，触纸即洇开 ───── */
  function fall(x, y0, y1, { color = INK, size = 1, hang = 0, onRelease, onLand } = {}) {
    let y = y0;
    let v = 60;
    let released = hang <= 0;
    const r0 = 3.2 * size;
    add({
      step(dt) {
        if (!released) {
          if (this.age < hang) return true;
          released = true;
          y = y0 + r0 * 1.05; // 从悬挂时珠子的位置松手
          onRelease?.();
        }
        v += 2200 * dt;
        y += v * dt;
        if (y < y1) return true;
        onLand?.();
        wash(x, y1, { color, R: 26 * size, a: 0.26, grow: 1.1, hold: 0.7, fade: 1.8 });
        ripple(x, y1, { color, r: 40 * size, rings: 2, a: 0.2 });
        return false;
      },
      draw() {
        g.fillStyle = rgba(color, 0.85);
        g.beginPath();
        if (!released) { // 悬在墨边上：越鼓越圆、被自己的重量拉长
          const e = easeOut(Math.min(1, this.age / hang));
          const rx = r0 * (0.3 + 0.7 * e);
          const ry = rx * (1 + 0.5 * e);
          g.ellipse(x, y0 + ry * 0.7, rx, ry, 0, 0, TAU);
        } else { // 下坠：圆身 + 向上的尖尾
          g.arc(x, y, r0, 0, TAU);
          g.moveTo(x - r0 * 0.85, y - r0 * 0.4);
          g.quadraticCurveTo(x, y - r0 * 4.2, x + r0 * 0.85, y - r0 * 0.4);
        }
        g.fill();
      },
    });
  }

  // 指尖落在纸上：一小团墨晕 + 两圈水纹（体量小，不抢内容）
  function splash(x, y, { color = INK, size = 1 } = {}) {
    wash(x, y, { color, R: 24 * size, a: color === ZHU ? 0.14 : 0.13, grow: 0.8, hold: 0.15, fade: 1.3 });
    ripple(x, y, { color, r: 34 * size, rings: 2, a: 0.18 });
  }

  function clear() {
    items.length = 0;
    if (W) g.clearRect(0, 0, W, H);
  }
  function destroy() {
    dead = true;
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    items.length = 0;
  }

  return {
    ripple, wash, spatter, fall, splash, clear, destroy, advance,
    get busy() { return items.length > 0; },
  };
}
