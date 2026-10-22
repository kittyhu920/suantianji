// 兆象：兆纹怎样被读成吉凶。映射规则只在这一个文件里，改规则只改这一处。
//
// 重要：这套映射是本作自己的设定。商代的人如何据兆定吉凶，史料里并无定论；
// 卜辞里常见“吉”“小吉”“亡尤”“弗吉”“有祟”这样的断语，本作取了这五个词，再给它们配上兆纹的形状。
// 不要把下面的规则写成“史实”。
//
// 度量（crack.js 的 metrics，全部来自兆纹的几何）：
//   ang        兆枝整体的方向，水平为 0°，向上为正，向下为负
//   ratio      兆枝长 / 兆干长
//   forks      兆枝上的分叉数
//   gaps       兆枝上的断口数
//   trunkGaps  兆干上的断口数
//
// 规则按顺序判定，先中先得：
//   1 有祟   兆枝有断口，并且（兆干也有断口，或兆枝向下）  —— 干枝皆折
//   2 弗吉   兆枝向下超过 10°，或兆枝有断口，或兆枝短于兆干的 34%  —— 垂、断、弱
//   3 亡尤   兆枝近乎水平（≤18°），分叉不超过 1 处，枝长在兆干的 45% 以上，兆干无断口  —— 干直枝平
//   4 吉     兆枝上扬（>18°），分叉不超过 2 处  —— 舒展
//   5 小吉   其余（分叉多，或枝长不足而没有断）  —— 繁而不乱，有得有失

export const OMENS = {
  ji: { key: 'ji', name: '吉', tone: 'ji', line: '枝向上扬，干直枝舒，是顺的兆。' },
  xiaoji: { key: 'xiaoji', name: '小吉', tone: 'ji', line: '纹路繁而不乱，有得有失，是半顺的兆。' },
  wuyou: { key: 'wuyou', name: '亡尤', tone: 'ji', line: '干直枝平，不惊不险；亡尤，是没有灾咎的兆。' },
  fuji: { key: 'fuji', name: '弗吉', tone: 'xiong', line: '枝垂、枝断或枝太短，力道不足，是不顺的兆。' },
  yousui: { key: 'yousui', name: '有祟', tone: 'xiong', line: '干枝皆折，纹向下沉，是有祟的兆。' },
};
export const OMEN_KEYS = Object.keys(OMENS);

/** 吉凶的两极：吉、小吉、亡尤算“吉”一边，弗吉、有祟算“凶”一边 */
export const isXiong = (key) => OMENS[key].tone === 'xiong';

export function classify(m) {
  if (m.gaps >= 1 && (m.trunkGaps >= 1 || m.ang < 0)) return 'yousui';
  if (m.ang < -10 || m.gaps >= 1 || m.ratio < 0.34) return 'fuji';
  if (m.ang <= 18 && m.forks <= 1 && m.ratio >= 0.45 && m.trunkGaps === 0) return 'wuyou';
  if (m.ang > 18 && m.forks <= 2) return 'ji';
  return 'xiaoji';
}

/** 把度量说成人话：结局时坦白“我是怎么读的” */
export function explain(m) {
  const dir = m.ang >= 0 ? `向上 ${Math.round(m.ang)}°` : `向下 ${Math.round(-m.ang)}°`;
  const parts = [`兆枝${Math.abs(m.ang) < 1 ? '平出' : dir}`, `长为兆干的 ${Math.round(m.ratio * 100)}%`, `分叉 ${m.forks} 处`];
  parts.push(m.gaps ? `枝上断了 ${m.gaps} 处` : '枝上无断口');
  if (m.trunkGaps) parts.push('干上也断了');
  return parts.join('，');
}

/** 本作的读兆规则，一句话一条，源流页与审读稿共用 */
export const RULES = [
  ['有祟', '兆枝有断口，并且兆干也有断口，或兆枝向下。'],
  ['弗吉', '兆枝向下超过 10°，或兆枝有断口，或兆枝不足兆干的三分之一。'],
  ['亡尤', '兆枝近乎水平（不超过 18°），分叉至多 1 处，枝长在兆干的 45% 以上，兆干无断口。'],
  ['吉', '兆枝上扬（超过 18°），分叉至多 2 处。'],
  ['小吉', '以上都不是：纹路繁，或枝长不足而没有断。'],
];
