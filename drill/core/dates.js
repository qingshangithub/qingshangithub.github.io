// 日期工具：统一使用本地日期字符串 YYYY-MM-DD，避免时区和夏令时造成“第 3 天”算错。

const DAY_MS = 86400000
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// pad2 把数字补成两位。
function pad2(n) {
  return String(n).padStart(2, '0')
}

// isValidDate 判断 dateStr 是否为合法的 YYYY-MM-DD 字符串。
// 先用正则限定格式，再经 Date.UTC 往返比对年月日，拒绝 2026-02-30、2026-13-01 这类会被自动进位的日期，
// 以及 0050-01-01 这类会被 Date.UTC 当成 1950 的两位年份。
export function isValidDate(dateStr) {
  if (typeof dateStr !== 'string') return false
  const m = DATE_RE.exec(dateStr)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

// utcDayNumber 把 YYYY-MM-DD 转成“自 1970-01-01 起的整天数”，全程按 UTC 计算以避开夏令时。
// 日期不合法时抛 RangeError，避免静默产生 NaN 或进位后的错误日期。
function utcDayNumber(dateStr) {
  if (!isValidDate(dateStr)) throw new RangeError(`无效日期：${dateStr}`)
  const [y, m, d] = dateStr.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / DAY_MS
}

// today 返回本地日期字符串，now 可注入以便测试。
export function today(now = () => new Date()) {
  const d = now()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// addDays 返回 dateStr 之后 n 天（n 可为负）的日期字符串。
// n 必须是整数，否则抛 TypeError；结果超出 Date 可表示范围时抛 RangeError。
export function addDays(dateStr, n) {
  if (!Number.isInteger(n)) throw new TypeError(`n 必须是整数：${n}`)
  const d = new Date((utcDayNumber(dateStr) + n) * DAY_MS)
  if (Number.isNaN(d.getTime())) throw new RangeError(`日期超出范围：${dateStr} + ${n}`)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

// daysBetween 返回从 a 到 b 的整天数（b 晚于 a 时为正）。
// 两侧都是 UTC 零点，差值天然是精确整数，不要再套 Math.round。
export function daysBetween(a, b) {
  return utcDayNumber(b) - utcDayNumber(a)
}
