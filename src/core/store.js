// 本地存储：只存在玩家自己的设备上。键名沿用旧版（stj-last / stj-visits / stj-endings），老玩家的记录不丢。

export const store = {
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

/** 把上一局的日期换成"昨天""3 天前"这样的说法 */
export function daysAgo(iso) {
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
  const n = day(new Date()) - day(new Date(iso));
  return n <= 0 ? '今天早些时候' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}
