// 题单的状态文案、排序、筛选与统计。纯函数，不依赖 DOM。

export const LEVEL_LABELS = { 1: '简单', 2: '中等', 3: '困难' }
export const STATUS_LABELS = { todo: '未做', stuck: '卡过', mastered: '已掌握' }
const ALL = 'all'

// statusOf 返回题目状态；没有存档项即“未做”。
export function statusOf(state, id) {
  return state.problems[id]?.status ?? 'todo'
}

const NUMERIC_NO = /^\d+$/

// problemLabel 力扣题号是数字时显示“题号. 标题”，补充题和剑指题只显示标题。
export function problemLabel(p) {
  return NUMERIC_NO.test(p.no) ? `${p.no}. ${p.title}` : p.title
}

// compareStudyOrder 学习顺序：按全局学习序号 seq 升序（模式顺序、难度由易到难、核心题优先、热度排名，由构建脚本算好）。
export function compareStudyOrder(a, b) {
  return a.seq - b.seq
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
