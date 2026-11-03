// 本地存储：只存在玩家自己的设备上。
//
//   store.get(key, 默认) / store.set(key, 值)    原始键，跨卷共用的东西用它（例如之后的生辰档案）
//   store.juan('qian')                           一卷自己的命名空间：get(name, 默认) / set(name, 值)
//   store.getJuan('qian', name, 默认)            跨卷读别的卷的记录（“上回你来卜，这回换成求签了”）
//
// 命名：新卷的键是 stj-<卷id>-<name>。签卷是最早的一卷，沿用旧版的键名 stj-last / stj-visits / stj-endings，
// 不迁移，老玩家的记录不丢。

const raw = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* 隐私模式下忽略 */
    }
  },
};

const LEGACY = new Set(['qian']); // 沿用无卷名前缀的旧键名的卷
const keyOf = (id, name) => (LEGACY.has(id) ? `stj-${name}` : `stj-${id}-${name}`);

export const store = {
  ...raw,
  juan(id) {
    return {
      get: (name, d) => raw.get(keyOf(id, name), d),
      set: (name, v) => raw.set(keyOf(id, name), v),
    };
  },
  getJuan(id, name, d) {
    return raw.get(keyOf(id, name), d);
  },
};

// 结局印位：封面题签下一列四个印位，就是四种结局（遵、逆、破、迷，与命书结局页的四方印一致），不分卷。
// 在任何一卷得过某个结局，那一格就盖着完整一方朱印（docs/DESIGN.md §19“结局印位”）。
// 不另存一份：直接从各卷已有的结局存档（stj-endings / stj-<卷id>-endings）取并集，两处不会不一致。
//   stamps.got()          { zun, ni, po, mi } 四种结局各自得没得（布尔），存储读不到就只有这一局的
//   stamps.count()        已得几种（0–4）
//   stamps.freshKey()     这一局新得（之前所有卷都没得过）、还没落印的结局键；没有就是 null
//   stamps.note(key)      记下这一局得了哪个结局（round 收尾时，在写入存档之前调用）
//   session               这一局的事（只在内存里；存储失败时封面也能显示这一局）：{ key, fresh, stamped, keys }
// 旧的 stj-stamps 键从来没人写过，不读也不迁移。
export const ENDING_KEYS = ['zun', 'ni', 'po', 'mi'];
const JUAN_IDS = ['qian', 'gua', 'bu', 'xing', 'niao', 'zi', 'li']; // 与 juan/index.js 一致；新增一卷时补在这里
const storedHas = (key) => JUAN_IDS.some((id) => raw.get(keyOf(id, 'endings'), []).includes(key));
const session = { key: null, fresh: false, stamped: false, keys: new Set() };
export const stamps = {
  session,
  /** withFresh 为假时，这一局新得、还没落印的结局不算（落印的演出里，封面上那一格先是空的） */
  got(withFresh = true) {
    const skip = withFresh ? null : stamps.freshKey();
    return Object.fromEntries(ENDING_KEYS.map((k) => [k, k !== skip && (session.keys.has(k) || storedHas(k))]));
  },
  count: (withFresh = true) => Object.values(stamps.got(withFresh)).filter(Boolean).length,
  note(key) {
    session.fresh = !(session.keys.has(key) || storedHas(key));
    session.key = key;
    session.keys.add(key);
    session.stamped = false;
  },
  /** 这一局新得、还没落印的结局键 */
  freshKey: () => (session.fresh && !session.stamped && session.key ? session.key : null),
};

/** 把上一局的日期换成"昨天""3 天前"这样的说法 */
export function daysAgo(iso) {
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? '今天早些时候' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}
