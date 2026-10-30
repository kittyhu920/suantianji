// 屏幕空间的遮挡检查（只在 ?debug 下，由 desk.svelte.js 挂到 window.__desk.occlusions）。
// 穿模检查（overlaps.js）查的是 3D 里的东西有没有互相穿插；但从镜头看去，一件器物可以不穿插而画在书页的字上，
// 一张 DOM 的纸笺也可以压在器物上——这些在屏幕空间里才看得出。这里把
//   · 书（整本、扉页上写字的那一块）
//   · 每件看得见的器物（含筊杯）
//   · 当前屏的 DOM：桌上的纸笺、卡片、木牌、按钮（.desk-items 里画了底色或边的最外层元素，与按钮槽里的按钮）
// 都投影到画布的像素坐标，各取一个凸多边形（3D 的东西取所有网格包围盒角点的凸包），报告互相遮挡的对子：
//   window.__desk.occlusions()          → { pairs: [{ kind, a, b, area, frac }], soft: [...], count }
//   window.__desk.occlusions({ min: 0.04 }) → 重叠面积不到较小一方的 4% 的当作“擦边”，不算（默认）
// 算错的（count）：器物 × 扉页文字区、DOM × 器物、DOM × 书、DOM × DOM、器物 × 器物；
// 只列出不算的（soft）：器物 × 书的其余部分（封面、书脊、书边）。
// 仪式的每一屏、每种窗口大小都要为 0；见 docs/DESIGN.md §19“屏幕空间的遮挡检查”。

export function createOcclusions(desk, deskRef) {
  const { THREE } = desk;
  const P = new THREE.Vector3();

  const isLive = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  const solid = (m) => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat || mat.visible === false) return false;
    if (mat.depthWrite === false) return false;
    if (mat.transparent && mat.opacity < 0.05) return false;
    return true;
  };

  /* ───── 凸多边形 ───── */
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  function hull(pts) {
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const lo = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    const up = [];
    for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i]; const b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  // Sutherland–Hodgman：凸多边形 subject 被凸多边形 clip 裁剪（clip 须是逆时针或顺时针都行，按符号处理）
  function clipPoly(subject, clip) {
    const sgn = Math.sign(clip.reduce((s, a, i) => { const b = clip[(i + 1) % clip.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) || 1;
    let out = subject;
    for (let i = 0; i < clip.length && out.length; i++) {
      const a = clip[i];
      const b = clip[(i + 1) % clip.length];
      const inside = (q) => sgn * cross(a, b, q) >= 0;
      const input = out;
      out = [];
      for (let j = 0; j < input.length; j++) {
        const cur = input[j];
        const prev = input[(j + input.length - 1) % input.length];
        const ci = inside(cur);
        const pi = inside(prev);
        if (ci !== pi) {
          const d1 = [cur[0] - prev[0], cur[1] - prev[1]];
          const d2 = [b[0] - a[0], b[1] - a[1]];
          const den = d1[0] * d2[1] - d1[1] * d2[0];
          if (Math.abs(den) > 1e-9) {
            const t = ((a[0] - prev[0]) * d2[1] - (a[1] - prev[1]) * d2[0]) / den;
            out.push([prev[0] + d1[0] * t, prev[1] + d1[1] * t]);
          }
        }
        if (ci) out.push(cur);
      }
    }
    return out;
  }
  const overlapArea = (a, b) => (a.length < 3 || b.length < 3 ? 0 : area(clipPoly(a, b)));

  /* ───── 3D 的东西投影到画布像素 ───── */
  const toPx = (v) => { const q = desk.project(v); return [q.x, q.y]; };
  function meshPoints(obj, pts, filter) {
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      if (!o.isMesh || !isLive(o) || !solid(o) || filter?.(o)) return;
      const g = o.geometry;
      if (!g.boundingBox || g.userData.liveBox) g.computeBoundingBox();
      const b = g.boundingBox;
      if (!b || !isFinite(b.min.x)) return;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        P.set(x, y, z).applyMatrix4(o.matrixWorld);
        pts.push(toPx(P));
      }
    });
  }

  function threeItems() {
    const out = [];
    const { pieces, book } = deskRef;
    for (const [id, p] of Object.entries(pieces?.list ?? {})) {
      if (!p.wrap.visible || p.pose.P.s < 0.05) continue;
      const pts = [];
      meshPoints(p.group, pts);
      if (pts.length) out.push({ kind: 'piece', name: `器物:${id}`, poly: hull(pts) });
      if (p.cups?.group.visible) {
        const cp = [];
        meshPoints(p.cups.group, cp);
        if (cp.length) out.push({ kind: 'piece', name: '筊杯', poly: hull(cp) });
      }
    }
    let text = null;
    let ledger = null; // 右页（平躺的封面里侧）上记账的那一块
    let body = null;
    if (book?.root.visible && book.mode !== 'doc') {
      const pts = [];
      for (const s of book.reading?.list ?? []) s.fMesh.geometry.userData.liveBox = true; // 纸的包围盒按现在的顶点重算
      meshPoints(book.inner, pts);
      if (pts.length) body = hull(pts);
      if (book.mode === 'ritual') {
        text = book.pageQuad().map((q) => [q.x, q.y]);
        ledger = book.coverQuad?.()?.map((q) => [q.x, q.y]) ?? null;
      }
    }
    return { out, text, ledger, body };
  }

  /* ───── DOM ───── */
  function domItems() {
    const c = desk.rect;
    const list = [];
    const seen = new Set();
    const visible = (el, cs, r) => r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
    const painted = (cs) => cs.backgroundImage !== 'none' || !/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)|transparent/.test(cs.backgroundColor);
    const take = (el, label) => {
      if (seen.has(el)) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (!visible(el, cs, r)) return;
      // 祖先里 opacity 为 0（入场动画还没开始）也不算
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) if (+getComputedStyle(n).opacity < 0.05) return;
      seen.add(el);
      const name = label ?? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.classList.length ? `.${[...el.classList].slice(0, 2).join('.')}` : ''}`;
      const x0 = r.left - c.left; const y0 = r.top - c.top; const x1 = r.right - c.left; const y1 = r.bottom - c.top;
      list.push({ kind: 'dom', name, el, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
    };
    // 桌上的纸笺、卡片、木牌：.desk-items 里画了底色或底纹的最外层元素
    const items = document.querySelector('.desk-items');
    if (items) {
      const walk = (el) => {
        for (const ch of el.children) {
          if (ch.matches('.piece-slot, .proxy, script, style')) continue;
          const cs = getComputedStyle(ch);
          if (cs.display === 'none') continue;
          if (painted(cs) || ch.matches('button, input, textarea, svg, canvas, img, .omen-fig')) take(ch);
          else walk(ch);
        }
      };
      walk(items);
    }
    for (const b of document.querySelectorAll('.bench-slot button, .bench-slot .oracle-wait')) take(b);
    return list;
  }

  return function occlusions({ min = 0.04 } = {}) {
    const { out: pieces, text, ledger, body } = threeItems();
    const dom = domItems();
    const pairs = [];
    const soft = [];
    const add = (arr, kind, a, b, ov) => {
      if (!ov) return;
      const small = Math.min(area(a.poly), area(b.poly)) || 1;
      const frac = ov / small;
      if (frac < min) return;
      arr.push({ kind, a: a.name, b: b.name, area: Math.round(ov), frac: +frac.toFixed(2) });
    };
    for (const p of pieces) {
      if (text) add(pairs, '器物挡扉页文字', p, { name: '书:扉页文字区', poly: text }, overlapArea(p.poly, text));
      if (ledger) add(pairs, '器物挡右页的账', p, { name: '书:右页记账区', poly: ledger }, overlapArea(p.poly, ledger));
      if (body) add(soft, '器物压书', p, { name: '书', poly: body }, overlapArea(p.poly, body));
    }
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) add(pairs, '器物互挡', pieces[i], pieces[j], overlapArea(pieces[i].poly, pieces[j].poly));
    for (const d of dom) {
      for (const p of pieces) add(pairs, 'DOM 压器物', d, p, overlapArea(d.poly, p.poly));
      if (body) add(pairs, 'DOM 压书', d, { name: '书', poly: body }, overlapArea(d.poly, body));
    }
    for (let i = 0; i < dom.length; i++) for (let j = i + 1; j < dom.length; j++) {
      if (dom[i].el.contains(dom[j].el) || dom[j].el.contains(dom[i].el)) continue;
      add(pairs, 'DOM 互压', dom[i], dom[j], overlapArea(dom[i].poly, dom[j].poly));
    }
    pairs.sort((p, q) => q.area - p.area);
    return { count: pairs.length, pairs, soft, dom: dom.map((d) => d.name), pieces: pieces.map((p) => p.name) };
  };
}
