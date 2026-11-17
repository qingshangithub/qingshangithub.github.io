// 复习调度与今日待办。纯函数，不依赖 DOM；日期均为本地 YYYY-MM-DD 字符串，可直接用字典序比较。
import { addDays, daysBetween } from './dates.js'

export const ROUND_OFFSETS = { 2: 3, 3: 7, 4: 21 }
export const ALL_ROUNDS = [2, 3, 4]
export const MAX_REVIEWS_PER_DAY = 8
export const MAX_WEEK = 4
const DAYS_PER_WEEK = 7

// laterOf 返回两个日期字符串中较晚的一个。
function laterOf(a, b) {
  return a > b ? a : b
}

// newReview 创建一个未完成的复习轮。
function newReview(round, due) {
  return { round, due, doneAt: null, passed: null }
}

// recordFirstDone 生成“第一次做完”的存档项。
// 顺畅的非核心题只排第 2 轮；卡过的题和所有核心题排第 2、3、4 轮。
export function recordFirstDone({ smooth, core, date, note }) {
  const rounds = smooth && !core ? [2] : ALL_ROUNDS
  return {
    status: smooth ? 'mastered' : 'stuck',
    firstDoneAt: date,
    note,
    reviews: rounds.map((r) => newReview(r, addDays(date, ROUND_OFFSETS[r]))),
  }
}

// completeReview 完成某一轮复习，返回新的存档项，不修改入参。
// 通过：后续未完成轮不早于次日，全部完成后变 mastered。
// 未通过：状态变 stuck，该轮顺延到次日，并补齐缺失的第 2、3、4 轮。
// passed 必须是布尔值，否则抛 TypeError，避免 undefined 被当成“未通过”。
export function completeReview(entry, round, passed, date) {
  if (typeof passed !== 'boolean') throw new TypeError(`passed 必须是布尔值：${passed}`)
  const target = entry.reviews.find((r) => r.round === round && r.doneAt === null)
  if (!target) throw new Error(`没有待完成的第 ${round} 轮复习`)

  const tomorrow = addDays(date, 1)
  let status = entry.status
  let reviews

  if (passed) {
    reviews = entry.reviews.map((r) => {
      if (r.round === round && r.doneAt === null) return { ...r, doneAt: date, passed: true }
      if (r.doneAt === null) return { ...r, due: laterOf(r.due, tomorrow) }
      return { ...r }
    })
    if (reviews.every((r) => r.doneAt !== null)) status = 'mastered'
  } else {
    status = 'stuck'
    reviews = entry.reviews.map((r) => {
      if (r.round === round && r.doneAt === null) return { ...r, due: tomorrow }
      if (r.doneAt === null) return { ...r, due: laterOf(r.due, tomorrow) }
      return { ...r }
    })
    for (const rd of ALL_ROUNDS) {
      if (!reviews.some((r) => r.round === rd)) {
        reviews.push(newReview(rd, laterOf(addDays(entry.firstDoneAt, ROUND_OFFSETS[rd]), tomorrow)))
      }
    }
    reviews.sort((a, b) => a.round - b.round)
  }
  return { ...entry, status, reviews }
}

// byDueThenId 先按到期日升序（逾期最久优先），再按 id 数值升序。
function byDueThenId(a, b) {
  if (a.due !== b.due) return a.due < b.due ? -1 : 1
  if (a.id !== b.id) return Number(a.id) - Number(b.id)
  return a.round - b.round
}

// dueReviews 返回今天及以前到期的复习，每题只取最早的未完成轮，最多 cap 条；total 是截断前的总数。
export function dueReviews(state, todayStr, cap = MAX_REVIEWS_PER_DAY) {
  const all = []
  for (const [id, entry] of Object.entries(state.problems)) {
    const pending = entry.reviews.filter((r) => r.doneAt === null).sort((a, b) => a.round - b.round)
    if (pending.length > 0 && pending[0].due <= todayStr) {
      all.push({ id, round: pending[0].round, due: pending[0].due })
    }
  }
  all.sort(byDueThenId)
  return { items: all.slice(0, cap), total: all.length }
}

// upcomingReviews 返回今天之后 days 天内（含第 days 天）到期的复习，每题只取最早的未完成轮，按到期日排序。
export function upcomingReviews(state, todayStr, days = 7) {
  const limit = addDays(todayStr, days)
  const items = []
  for (const [id, entry] of Object.entries(state.problems)) {
    const pending = entry.reviews.filter((r) => r.doneAt === null).sort((a, b) => a.round - b.round)
    if (pending.length > 0 && pending[0].due > todayStr && pending[0].due <= limit) {
      items.push({ id, round: pending[0].round, due: pending[0].due })
    }
  }
  return items.sort(byDueThenId)
}

// currentWeek 返回学习计划当前所处周次，范围 1 到 MAX_WEEK。
export function currentWeek(startDate, todayStr) {
  const week = Math.floor(daysBetween(startDate, todayStr) / DAYS_PER_WEEK) + 1
  return Math.min(MAX_WEEK, Math.max(1, week))
}

// byWeekCoreRank 先按周次，再核心题优先，最后按 CodeTop 热度排名。
function byWeekCoreRank(a, b) {
  if (a.week !== b.week) return a.week - b.week
  if (a.core !== b.core) return a.core ? -1 : 1
  return a.rank - b.rank
}

// suggestNew 返回今日建议的新题：只推荐未开始的题，名额为 newPerDay 减去今天已做的新题数。
// 已解锁周次内没有可做的题时，提前推荐后面的周。
// 今天已做的题（含“重新记录”覆盖的旧题）都占用 newPerDay 名额，因为它们都是今天完成的练习。
export function suggestNew(problems, state, todayStr) {
  const week = currentWeek(state.settings.startDate, todayStr)
  const doneToday = Object.values(state.problems).filter((e) => e.firstDoneAt === todayStr).length
  const quota = Math.max(0, state.settings.newPerDay - doneToday)
  const pool = problems.filter((p) => !state.problems[p.id]).sort(byWeekCoreRank)
  const eligible = pool.filter((p) => p.week <= week)
  return (eligible.length > 0 ? eligible : pool).slice(0, quota)
}

// todayTodo 汇总今日待办：到期复习和建议新题。
export function todayTodo(state, problems, todayStr) {
  return {
    reviews: dueReviews(state, todayStr),
    newItems: suggestNew(problems, state, todayStr),
  }
}

// weekProgress 统计某一周的题目总数与已开始数。
export function weekProgress(problems, state, week) {
  const list = problems.filter((p) => p.week === week)
  return { done: list.filter((p) => state.problems[p.id]).length, total: list.length }
}
