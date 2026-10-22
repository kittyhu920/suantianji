// 问题的本地归类：在玩家的浏览器里完成，只有"类别"会随统计上报，问题原文不会离开设备。
//
// 重要：下面的词表和归类规则是本作自己的设定，只是粗糙的关键词匹配，不是语义理解，会判错。
// 统计里的"感情""工作"等，意思是"问题里出现了这类词"。改词表只改这一个文件。
//
// 两种类别：
//   语气 tone   沿用观人术的 questionMood（犹豫 / 困惑 / 期待，见 profile.js）
//   主题 topic  下面的 TOPICS，按顺序匹配，先中先得；一个词都没中归"其他"

import { questionMood } from './profile.js';

export const TONE_OF = { 犹豫: 'hesitate', 困惑: 'puzzled', 期待: 'hopeful' };
export const TONE_LABEL = { hesitate: '犹豫', puzzled: '困惑', hopeful: '期待' };

export const TOPICS = [
  { key: 'study', label: '学业考试', words: ['考试', '考研', '考公', '考编', '高考', '中考', '成绩', '录取', '论文', '答辩', '毕业', '学业', '上岸', '补考', '挂科', '升学', '留学', '绩点', '保研'] },
  { key: 'work', label: '工作', words: ['工作', '面试', '升职', '加薪', '跳槽', '辞职', '裁员', '老板', '同事', '职业', '事业', '项目', '创业', 'offer', '岗位', '实习', '转行', '求职', '上班', '功名'] },
  { key: 'love', label: '感情', words: ['感情', '喜欢', '恋爱', '分手', '复合', '表白', '对象', '男友', '女友', '男朋友', '女朋友', '暗恋', '结婚', '婚姻', '前任', '老公', '老婆', '相亲', '桃花', '姻缘'] },
  { key: 'family', label: '家人', words: ['家人', '父母', '爸', '妈', '孩子', '儿子', '女儿', '兄弟', '姐妹', '爷爷', '奶奶', '外公', '外婆', '亲戚', '家里', '家庭'] },
  { key: 'health', label: '健康', words: ['健康', '身体', '生病', '病', '手术', '医院', '失眠', '睡不', '焦虑', '抑郁', '压力', '情绪', '头痛', '怀孕', '体检', '康复'] },
  { key: 'money', label: '钱财', words: ['钱', '财', '投资', '股票', '基金', '赚', '亏', '工资', '贷款', '房价', '买房', '债', '收入', '存款', '理财'] },
  { key: 'move', label: '搬迁出行', words: ['搬家', '搬迁', '搬到', '移民', '出行', '出国', '旅行', '旅游', '出差', '远行', '换城市', '去外地', '回老家', '租房'] },
];
export const OTHER = { key: 'other', label: '其他' };
export const TOPIC_KEYS = [...TOPICS.map((t) => t.key), OTHER.key];
export const TOPIC_LABEL = Object.fromEntries([...TOPICS, OTHER].map((t) => [t.key, t.label]));

/** 问题 → { tone, topic }；没写问题返回 { tone: null, topic: null }。入参只在本地用，不会被带出去 */
export function classifyQuestion(q) {
  const text = String(q ?? '').trim();
  if (!text) return { tone: null, topic: null };
  const lower = text.toLowerCase();
  const hit = TOPICS.find((t) => t.words.some((w) => lower.includes(w)));
  return { tone: TONE_OF[questionMood(text)] ?? null, topic: hit ? hit.key : OTHER.key };
}
