// 题单的状态文案、排序、筛选与统计。纯函数，不依赖 DOM。

export const LEVEL_LABELS = { 1: '简单', 2: '中等', 3: '困难' }
export const STATUS_LABELS = { todo: '未做', stuck: '卡过', mastered: '已掌握' }
const ALL = 'all'

// statusOf 返回题目状态；没有存档项即“未做”。
export function statusOf(state, id) {
  return state.problems[id]?.status ?? 'todo'
}

// compareStudyOrder 学习顺序：周次升序，同周核心题优先，再按 CodeTop 热度排名。
export function compareStudyOrder(a, b) {
  if (a.week !== b.week) return a.week - b.week
  if (a.core !== b.core) return a.core ? -1 : 1
  return a.rank - b.rank
}

// filterProblems 按模式、难度、状态筛选，结果按学习顺序排序；值为 'all' 表示不筛选。
// 难度可以是数字或数字字符串（下拉框的值总是字符串）。
export function filterProblems(problems, state, { pattern, level, status }) {
  return problems
    .filter((p) => pattern === ALL || p.pattern === pattern)
    .filter((p) => level === ALL || p.level === Number(level))
    .filter((p) => status === ALL || statusOf(state, p.id) === status)
    .sort(compareStudyOrder)
}

// summarize 统计各状态的题数。
export function summarize(problems, state) {
  const out = { total: problems.length, todo: 0, stuck: 0, mastered: 0 }
  for (const p of problems) out[statusOf(state, p.id)]++
  return out
}
