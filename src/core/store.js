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

// 残印：封面上每一卷一个残印位，印的完整度 = 这一卷已得的结局数（四种结局各占印的一角，集齐四个才是完整一方，docs/DESIGN.md §19）。
// 不另存一份：直接从各卷已有的结局存档（stj-endings / stj-<卷id>-endings）推出来，两处不会不一致。
//   stamps.parts(id)   [遵, 逆, 破, 迷] 四个角各自得没得（布尔数组），存储读不到就是全空
//   stamps.count(id)   已得几个（0–4）
//   session            这一局的事（只在内存里；存储失败时封面也能显示这一局）：{ juan, key, fresh }
//                      juan 是这一局的卷，key 是这一局的结局，fresh 为真表示这个结局是第一次得到、合书落印时才盖上去
// 旧的 stj-stamps 键从来没人写过，不读也不迁移。
export const ENDING_KEYS = ['zun', 'ni', 'po', 'mi'];
const gotOf = (id) => {
  const list = new Set(raw.get(keyOf(id, 'endings'), []));
  if (session.juan === id && session.key) list.add(session.key);
  return list;
};
const session = { juan: null, key: null, fresh: false, stamped: false };
export const stamps = {
  session,
  /** withFresh 为假时，这一局新得、还没落印的那一角不算（落印的演出里，封面上先是“没有这一角”的样子） */
  parts(id, withFresh = true) {
    const got = gotOf(id);
    const skip = !withFresh && session.juan === id ? stamps.freshIndex() : -1;
    return ENDING_KEYS.map((k, i) => got.has(k) && i !== skip);
  },
  count: (id) => stamps.parts(id).filter(Boolean).length,
  /** 记下这一局得了哪个结局（round 收尾时，在写入存档之前调用，prevHad = 之前是否已得过） */
  note(id, key, prevHad) { session.juan = id; session.key = key; session.fresh = !prevHad; session.stamped = false; },
  /** 落印时用：这一局新得的那一角（没有新得就是 null） */
  freshIndex: () => (session.fresh && !session.stamped && session.key ? ENDING_KEYS.indexOf(session.key) : -1),
};

/** 把上一局的日期换成"昨天""3 天前"这样的说法 */
export function daysAgo(iso) {
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? '今天早些时候' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}
