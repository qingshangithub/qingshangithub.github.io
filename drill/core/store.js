// 存档模块：localStorage 读写、结构校验、版本迁移、导入导出。不依赖 DOM。
import { daysBetween, isValidDate } from './dates.js'

export const STORAGE_KEY = 'drill.v1'
export const CORRUPT_KEY = 'drill.v1.corrupt'
export const CURRENT_VERSION = 1

const MAX_NEW_PER_DAY = 20
export const DEFAULT_NEW_PER_DAY = 1
export const DEFAULT_WEEKEND_PER_DAY = 4
const PROBLEM_STATUSES = ['stuck', 'mastered']
const MIN_REVIEW_ROUND = 2
const MAX_REVIEW_ROUND = 4
const MIN_RATING = 1
const MAX_RATING = 3

// isObject 判断是否为普通对象（排除 null 和数组）。
function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

// emptyState 返回一份全新的 v1 存档。
export function emptyState(startDate) {
  return {
    version: CURRENT_VERSION,
    settings: { startDate, newPerDay: DEFAULT_NEW_PER_DAY, weekendPerDay: DEFAULT_WEEKEND_PER_DAY, lastExportAt: null },
    problems: {},
    lessons: {},
    templates: {},
    flash: [],
    recognition: [],
  }
}

// isIntInRange 判断 v 是否为 [min, max] 内的整数。
function isIntInRange(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max
}

// validateReview 校验 problems[id].reviews 中的一项，path 形如 problems.206.reviews[0]；合法返回 null，否则返回以字段路径开头的错误。
function validateReview(path, r) {
  if (!isObject(r)) return `${path} 必须是对象`
  if (!isIntInRange(r.round, MIN_REVIEW_ROUND, MAX_REVIEW_ROUND)) {
    return `${path}.round 必须是 ${MIN_REVIEW_ROUND} 到 ${MAX_REVIEW_ROUND} 的整数`
  }
  if (!isValidDate(r.due)) return `${path}.due 必须是合法的 YYYY-MM-DD 日期`
  if (r.doneAt !== null && !isValidDate(r.doneAt)) return `${path}.doneAt 必须是 null 或合法日期`
  if (r.passed !== null && typeof r.passed !== 'boolean') return `${path}.passed 必须是 null 或布尔值`
  return null
}

// validateProblemEntry 校验 problems 中 id 对应的一条记录；合法返回 null，否则返回以字段路径开头的错误。
function validateProblemEntry(id, e) {
  const path = `problems.${id}`
  if (!isObject(e)) return `${path} 必须是对象`
  if (!PROBLEM_STATUSES.includes(e.status)) return `${path}.status 必须是 ${PROBLEM_STATUSES.join(' 或 ')}`
  if (!isValidDate(e.firstDoneAt)) return `${path}.firstDoneAt 必须是合法的 YYYY-MM-DD 日期`
  if (!isObject(e.note)) return `${path}.note 必须是对象`
  for (const key of ['pattern', 'stuck', 'edge']) {
    if (typeof e.note[key] !== 'string') return `${path}.note.${key} 必须是字符串`
  }
  if (!Array.isArray(e.reviews)) return `${path}.reviews 必须是数组`
  for (let i = 0; i < e.reviews.length; i++) {
    const err = validateReview(`${path}.reviews[${i}]`, e.reviews[i])
    if (err) return err
  }
  return null
}

// validateTemplateEntry 校验 templates 中模式 id 对应的一条背诵记录；合法返回 null，否则返回以字段路径开头的错误。
function validateTemplateEntry(id, e) {
  const path = `templates.${id}`
  if (!isObject(e)) return `${path} 必须是对象`
  if (!isValidDate(e.lastRecitedAt)) return `${path}.lastRecitedAt 必须是合法的 YYYY-MM-DD 日期`
  if (!isIntInRange(e.rating, MIN_RATING, MAX_RATING)) return `${path}.rating 必须是 ${MIN_RATING} 到 ${MAX_RATING} 的整数`
  return null
}

// validateLessonEntry 校验 lessons 中课 id 对应的一条学习记录；合法返回 null，否则返回以字段路径开头的错误。
function validateLessonEntry(id, e) {
  const path = `lessons.${id}`
  if (!isObject(e)) return `${path} 必须是对象`
  if (!isValidDate(e.doneAt)) return `${path}.doneAt 必须是合法的 YYYY-MM-DD 日期`
  if (typeof e.skipped !== 'boolean') return `${path}.skipped 必须是布尔值`
  return null
}

// validateFlashEntry 校验 flash 数组中第 i 条快闪记录；合法返回 null，否则返回以字段路径开头的错误。
function validateFlashEntry(i, e) {
  const path = `flash[${i}]`
  if (!isObject(e)) return `${path} 必须是对象`
  if (!isValidDate(e.date)) return `${path}.date 必须是合法的 YYYY-MM-DD 日期`
  if (typeof e.problemId !== 'string') return `${path}.problemId 必须是字符串`
  if (!Number.isInteger(e.seconds) || e.seconds < 0) return `${path}.seconds 必须是非负整数`
  if (typeof e.finished !== 'boolean') return `${path}.finished 必须是布尔值`
  return null
}

// validateRecognitionEntry 校验 recognition 数组中第 i 条识别训练记录；合法返回 null，否则返回以字段路径开头的错误。
function validateRecognitionEntry(i, e) {
  const path = `recognition[${i}]`
  if (!isObject(e)) return `${path} 必须是对象`
  if (!isValidDate(e.date)) return `${path}.date 必须是合法的 YYYY-MM-DD 日期`
  if (!Number.isInteger(e.total) || e.total < 0) return `${path}.total 必须是非负整数`
  if (!isIntInRange(e.correct, 0, e.total)) return `${path}.correct 必须是 0 到 total 的整数`
  return null
}

// firstEntryError 对 entries 逐项调用 check(key, value)，返回第一个错误，全部合法返回 null。
function firstEntryError(entries, check) {
  for (const [key, value] of entries) {
    const err = check(key, value)
    if (err) return err
  }
  return null
}

// validateState 校验存档结构及每条记录的字段，返回 {ok:true} 或 {ok:false,error}。
// 这里是存档的信任边界：通过校验的数据才会进入 dates.js 和各视图，所以日期、枚举、数值范围都要查。
export function validateState(s) {
  if (!isObject(s)) return { ok: false, error: '存档不是对象' }
  if (s.version !== CURRENT_VERSION) return { ok: false, error: `存档版本 ${s.version} 不被支持` }
  const st = s.settings
  if (!isObject(st)) return { ok: false, error: '缺少 settings' }
  if (!isValidDate(st.startDate)) {
    return { ok: false, error: 'settings.startDate 必须是合法的 YYYY-MM-DD 日期' }
  }
  if (!Number.isInteger(st.newPerDay) || st.newPerDay < 1 || st.newPerDay > MAX_NEW_PER_DAY) {
    return { ok: false, error: `settings.newPerDay 必须是 1 到 ${MAX_NEW_PER_DAY} 的整数` }
  }
  if (!Number.isInteger(st.weekendPerDay) || st.weekendPerDay < 1 || st.weekendPerDay > MAX_NEW_PER_DAY) {
    return { ok: false, error: `settings.weekendPerDay 必须是 1 到 ${MAX_NEW_PER_DAY} 的整数` }
  }
  if (st.lastExportAt !== null && !isValidDate(st.lastExportAt)) {
    return { ok: false, error: 'settings.lastExportAt 必须是 null 或合法日期' }
  }
  if (!isObject(s.problems)) return { ok: false, error: 'problems 必须是对象' }
  if (!isObject(s.lessons)) return { ok: false, error: 'lessons 必须是对象' }
  if (!isObject(s.templates)) return { ok: false, error: 'templates 必须是对象' }
  if (!Array.isArray(s.flash)) return { ok: false, error: 'flash 必须是数组' }
  if (!Array.isArray(s.recognition)) return { ok: false, error: 'recognition 必须是数组' }
  const error =
    firstEntryError(Object.entries(s.problems), validateProblemEntry) ||
    firstEntryError(Object.entries(s.lessons), validateLessonEntry) ||
    firstEntryError(Object.entries(s.templates), validateTemplateEntry) ||
    firstEntryError(s.flash.entries(), validateFlashEntry) ||
    firstEntryError(s.recognition.entries(), validateRecognitionEntry)
  return error ? { ok: false, error } : { ok: true }
}

// migrate 把存档升级到当前结构；目前只有 v1。
// 早期 v1 存档没有 lessons 和 settings.weekendPerDay，这里补上默认值（只增不改，已有进度原样保留，也不改动入参）；字段齐全时原样返回同一个对象。
export function migrate(obj) {
  if (!isObject(obj) || typeof obj.version !== 'number') throw new Error('存档缺少版本号')
  if (obj.version !== CURRENT_VERSION) throw new Error(`不支持的存档版本 ${obj.version}`)
  const needsLessons = obj.lessons === undefined
  const needsWeekend = isObject(obj.settings) && obj.settings.weekendPerDay === undefined
  if (!needsLessons && !needsWeekend) return obj
  return {
    ...obj,
    ...(needsLessons ? { lessons: {} } : {}),
    ...(needsWeekend ? { settings: { ...obj.settings, weekendPerDay: DEFAULT_WEEKEND_PER_DAY } } : {}),
  }
}

// parseImport 解析并校验一段存档文本，成功时带回题目数量供确认弹窗显示。
export function parseImport(text) {
  let obj
  try {
    obj = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `不是合法的 JSON：${e.message}` }
  }
  let state
  try {
    state = migrate(obj)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  const v = validateState(state)
  if (!v.ok) return { ok: false, error: v.error }
  return { ok: true, state, problemCount: Object.keys(state.problems).length }
}

// exportJson 把存档序列化成带缩进的 JSON 文本。
export function exportJson(state) {
  return JSON.stringify(state, null, 2)
}

// memoryStorage 返回接口同 localStorage 的内存实现，用于 localStorage 不可用时。
export function memoryStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
}

// pickStorage 优先使用 win.localStorage；隐私模式等读写失败时退回内存并标记不持久。
export function pickStorage(win) {
  try {
    const s = win.localStorage
    const probe = '__drill_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return { storage: s, persistent: true }
  } catch {
    return { storage: memoryStorage(), persistent: false }
  }
}

// createStore 封装存档的读取与写入。
// load 在存档损坏时先把原文另存到 CORRUPT_KEY，且不覆盖原存档；load 只保留最近一份损坏存档，再次遇到损坏会覆盖上一份备份。
// 备份写入失败（如配额已满）时 load 不抛错，返回 backedUp:false，并让 save 拒绝写入，避免新存档覆盖唯一的损坏原文。
// save 写入前先校验结构，不合法的数据（如 seconds 为 NaN）不落盘。
export function createStore({ storage, persistent = true, today }) {
  let blocked = null
  // lastRaw 是本标签页最近一次读到或写入的存档原文（没有存档时为 null），用来发现别的标签页的改动。
  let lastRaw = null
  return {
    persistent,
    // load 读取存档；存档损坏时返回空存档并带上 corrupt、error、backedUp。每次调用都会重新判断是否需要暂停保存。
    load() {
      blocked = null
      const raw = storage.getItem(STORAGE_KEY)
      lastRaw = raw
      if (raw === null) return { state: emptyState(today()), corrupt: false }
      const parsed = parseImport(raw)
      if (parsed.ok) return { state: parsed.state, corrupt: false }
      try {
        storage.setItem(CORRUPT_KEY, raw)
      } catch (e) {
        blocked = `存档损坏且无法备份（${e.message}），为避免覆盖原数据，已暂停保存`
        return { state: emptyState(today()), corrupt: true, error: parsed.error, backedUp: false }
      }
      return { state: emptyState(today()), corrupt: true, error: parsed.error, backedUp: true }
    },
    // save 写入存档，返回 {ok:true} 或 {ok:false,error}；损坏存档未能备份时拒绝写入，数据不合法时拒绝写入。
    save(state) {
      if (blocked !== null) return { ok: false, error: blocked }
      const v = validateState(state)
      if (!v.ok) return { ok: false, error: `存档数据不合法，未写入：${v.error}` }
      try {
        const text = JSON.stringify(state)
        storage.setItem(STORAGE_KEY, text)
        lastRaw = text
        return { ok: true }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },
    // restore 供用户明确确认的导入/恢复使用：先校验，再写入 STORAGE_KEY。
    // 用户已选择替换现有数据，所以它绕过“暂停保存”的拦截；只有写入成功后才解除暂停，校验失败或写入异常时暂停状态保持不变。
    restore(state) {
      const v = validateState(state)
      if (!v.ok) return { ok: false, error: `存档数据不合法，未写入：${v.error}` }
      try {
        const text = JSON.stringify(state)
        storage.setItem(STORAGE_KEY, text)
        lastRaw = text
      } catch (e) {
        return { ok: false, error: e.message }
      }
      blocked = null
      return { ok: true }
    },
    // latest 在存档自本标签页上次读写之后被别处（如另一个标签页）改过且内容合法时，返回解析后的最新存档，否则返回 null。
    // 每份新内容只返回一次；存档被删除、内容损坏或没有变化都返回 null，且不改变“已读到”的记录。
    // commit 前先用它刷新内存状态，避免旧标签页把整份旧数据写回，覆盖另一个标签页保存的进度。
    latest() {
      const raw = storage.getItem(STORAGE_KEY)
      if (raw === null || raw === lastRaw) return null
      const parsed = parseImport(raw)
      if (!parsed.ok) return null
      lastRaw = raw
      return parsed.state
    },
    // isBlocked 返回保存被暂停的提示文案（损坏存档未能备份时），未暂停则返回 null，供界面展示。
    isBlocked() {
      return blocked
    },
  }
}

// needsExportReminder 判断是否该提醒用户导出备份：有进度，且从未导出或距上次导出满 days 天。
export function needsExportReminder(state, todayStr, days = 7) {
  if (Object.keys(state.problems).length === 0) return false
  const last = state.settings.lastExportAt
  if (last === null) return true
  return daysBetween(last, todayStr) >= days
}
