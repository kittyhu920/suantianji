// 注：命书每一页的脚注。注的数据在各卷的 zhu.json 里（术语 → { body, kind, cite }）；
// 页的 zhu 字段列出这一页用到的术语，读命书时页脚显示它们的注（docs/DESIGN.md §12）。

/** 一组页上用到的术语 → 页脚要显示的注 [{ term, body, kind, cite }]，去重，卷里没有的术语略过 */
export function footnotes(zhu, terms) {
  const seen = new Set();
  const out = [];
  for (const t of terms) {
    if (seen.has(t) || !zhu?.[t]) continue;
    seen.add(t);
    out.push({ term: t, ...zhu[t] });
  }
  return out;
}
