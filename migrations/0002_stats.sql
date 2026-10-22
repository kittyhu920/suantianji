-- 匿名统计（functions/api/stat.js）：每局结束记一行。没有原文、没有 IP、没有任何跨局的标识。
-- day 由服务端按 UTC 日期填；result 是本局结果标识（签号 / 卦序 / 兆象），无结果时为 NULL。
-- 限流不另建表，复用 hits：键 "日期:s:IP 哈希前 16 位" 与 "日期:s*"（全站）。
CREATE TABLE IF NOT EXISTS rounds (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  day    TEXT    NOT NULL,           -- YYYY-MM-DD（UTC）
  juan   TEXT    NOT NULL,           -- qian | gua | bu
  domain TEXT,                       -- gong | yuan | shen，没选为 NULL
  ending TEXT    NOT NULL,           -- zun | ni | po | mi
  result TEXT,                       -- 签号 "0".."60" / 卦序 "1".."64" / 兆象 ji|xiaoji|wuyou|fuji|yousui
  dur    TEXT    NOT NULL,           -- lt1 | 1-2 | 2-5 | gt5（分钟）
  asked  INTEGER NOT NULL,           -- 是否写了问题（0/1）
  qtone  TEXT,                       -- 问题的语气：hesitate | puzzled | hopeful（本地归类）
  qtopic TEXT,                       -- 问题的主题：work | study | love | family | health | money | move | other（本地归类）
  theme  TEXT                        -- day | night，可选
);
CREATE INDEX IF NOT EXISTS rounds_day_juan ON rounds (day, juan);
