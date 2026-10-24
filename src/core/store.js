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

// 残印：每一卷得过的印，盖在书的封面四角（docs/DESIGN.md §19）。键 stj-stamps，值 { 卷id: true }。
// 现在只留数据的钩子：封面按它画出已得的角，还没有任何地方写入。
export const stamps = {
  all: () => raw.get('stj-stamps', {}),
  has: (id) => !!raw.get('stj-stamps', {})[id],
  set(id, got = true) { raw.set('stj-stamps', { ...raw.get('stj-stamps', {}), [id]: got }); },
};

/** 把上一局的日期换成"昨天""3 天前"这样的说法 */
export function daysAgo(iso) {
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? '今天早些时候' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}
