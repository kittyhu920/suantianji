-- 通灵限流计数：k 为 "日期:IP 哈希" 或 "日期:*"（全站），n 为当日次数
CREATE TABLE IF NOT EXISTS hits (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL
);
