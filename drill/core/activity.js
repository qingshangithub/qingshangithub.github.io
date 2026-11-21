// 学习活动统计：最近几天每天做了多少项。纯函数，只读存档，不新增存储。
import { addDays } from './dates.js'

// activityByDay 返回截止 todayStr 的最近 days 天（含今天，按日期从早到晚）的活动数。
// 一项活动 = 学完一课（跳过不算）、第一次做完一道题、完成一次复习、默写一张模板卡。
export function activityByDay(state, todayStr, days = 7) {
  const counts = new Map()
  const bump = (date) => counts.set(date, (counts.get(date) ?? 0) + 1)
  for (const l of Object.values(state.lessons)) if (!l.skipped) bump(l.doneAt)
  for (const e of Object.values(state.problems)) {
    bump(e.firstDoneAt)
    for (const r of e.reviews) if (r.doneAt) bump(r.doneAt)
  }
  for (const t of Object.values(state.templates)) bump(t.lastRecitedAt)
  const list = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(todayStr, -i)
    list.push({ date, count: counts.get(date) ?? 0, isToday: i === 0 })
  }
  return list
}
