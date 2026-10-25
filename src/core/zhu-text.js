// 把一句话里的术语切出来：页脚的说明是纯文字，用它找出本卷 zhu.json 里有注的术语，每个术语只在第一次出现时加点线。
// 返回 [{ t: '文字' }, { t: '术语', term: '术语' }, ...]，Codex 把带 term 的一段渲染成 <Zhu>。

export function termSegments(text, notes) {
  if (!text) return [];
  const terms = Object.keys(notes ?? {}).sort((a, b) => b.length - a.length);
  if (!terms.length) return [{ t: text }];
  const re = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  const seen = new Set();
  const out = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    if (m.index > at) out.push({ t: text.slice(at, m.index) });
    out.push({ t: m[0], term: m[0] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out;
}
