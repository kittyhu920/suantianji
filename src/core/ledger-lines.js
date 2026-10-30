// 仪式里写在右页（平躺的封面里侧）上的“账”：我（大师）一条条记下这一局的事实，是命书的伏笔。
// 全部是初稿，待审读。每条不超过 14 字，第一人称，墨色；不用朱、不加句尾的“〇”。
// 调用见各卷的 game：ctx.jot(key, 文本)（同一个 key 的旧条目被顶替），ctx.unjot(前缀)。
// 命书里的“账本”页是结局之后的完整旁注（core/book/pages.js），与这里不重复：这里只记一局进行时的几件事，且不带“怎么算的”。

const CN6 = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
const CN = '零一二三四五六七八九十';
const CUP = ['第一杯', '第二杯', '第三杯'];
const CUP_KIND = { sheng: '圣杯', yin: '阴杯', xiao: '笑杯' };
const YAO_NAME = { 9: '老阳', 8: '少阴', 7: '少阳', 6: '老阴' };
const CNV = { 6: '六', 7: '七', 8: '八', 9: '九' };

export const L = {
  // 签卷
  qianPick: (domain) => `你问${domain}，我记下`,
  qianShake: (n) => `我数你摇了 ${n} 次`,
  qianSign: (no) => `我抽给你${no}`,
  qianCup: (idx, kind) => `${CUP[idx]}${CUP_KIND[kind]}，我记着`,
  qianInsist: '你偏要这支，我记着',
  qianReroll: (n) => `你不认，已是第${n}签`,
  // 卦卷
  guaYao: (idx, v) => `我记${CN6[idx]}：${CNV[v]}，${YAO_NAME[v]}`,
  // 卜卷
  buSpot: (i) => `挑了第${CN[i + 1]}处，我记下`,
  buHold: (s) => `我数你按了${s}秒`,
  buJit: (px) => `我看你手抖${px}像素`,
  buOmen: (ang, name) => `兆枝${Math.abs(ang) < 1 ? '平出' : ang > 0 ? `向上 ${Math.round(ang)}°` : `向下 ${Math.round(-ang)}°`}，我读作${name}`,
  buAgain: (n) => `这是第${CN[n]}灼，我记着`,
};

/** 把每条用最长的样例展开一次，供检查字数（tests/gloss-wrap.test.mjs） */
export function allLedger() {
  return [
    L.qianPick('身心'), L.qianShake(99), L.qianSign('第六十一签'), ...[0, 1, 2].flatMap((i) => ['sheng', 'yin', 'xiao'].map((k) => L.qianCup(i, k))),
    L.qianInsist, L.qianReroll(3),
    ...[0, 1, 2, 3, 4, 5].flatMap((i) => [6, 7, 8, 9].map((v) => L.guaYao(i, v))),
    L.buSpot(5), L.buHold('10.0'), L.buJit(999), L.buOmen(-38, '小吉'), L.buOmen(38, '亡尤'), L.buOmen(0, '亡尤'), L.buAgain(3),
  ];
}
