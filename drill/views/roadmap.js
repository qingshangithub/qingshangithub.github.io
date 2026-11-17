// 路线视图：今日待办、周进度、阶段说明、面试节奏、设置与备份。
import { h, progressBar } from './dom.js'
import { todayTodo, currentWeek, weekProgress, MAX_WEEK, MAX_REVIEWS_PER_DAY } from '../core/schedule.js'
import { summarize } from '../core/filters.js'
import { needsExportReminder, exportJson, parseImport } from '../core/store.js'
import { daysBetween, isValidDate } from '../core/dates.js'

const MIN_NEW_PER_DAY = 1
const MAX_NEW_PER_DAY = 20
const REVOKE_DELAY_MS = 1000

const STAGES = [
  { title: '阶段一 · 把模板刻进手指', body: '12 个高频模式，每个模式一张模板卡。先遮住实现、只看函数签名默写，再做 2 到 3 道核心题。', links: [['模板卡', 'templates'], ['题单', 'problems']] },
  { title: '阶段二 · 限时快闪', body: '读题 2 分钟、设计 2 分钟、编码 8 分钟、验证 3 分钟。每天一道；每周做几次 30 秒识别训练。', links: [['快闪', 'flash'], ['识别训练', 'quiz']] },
  { title: '阶段三 · 间隔复习', body: '做完后第 3、7、21 天从空白重写。顺畅的非核心题只复习一次，卡过的题和核心题走满三轮。', links: [['复习', 'review']] },
]

const INTERVIEW_STEPS = [
  ['澄清（1 到 2 分钟）', '复述题目，确认输入输出、边界和复杂度要求。'],
  ['思路（2 到 3 分钟）', '至少说两种思路并比较，再选一个。'],
  ['边界（30 秒）', '编码前列出空输入、单元素、重复元素、溢出或越界。'],
  ['编码（5 到 15 分钟）', '边写边说；卡住时说出卡在哪里，不要沉默超过 15 秒。'],
  ['验证（2 到 3 分钟）', '拿一个小例子出声走一遍，不要问“这样应该对吧”。'],
  ['优化（1 到 2 分钟）', '主动说出时间和空间复杂度，给一个优化方向。'],
]

// downloadJson 触发浏览器下载一个 JSON 文件。
function downloadJson(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = h('a', { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

// doExport 下载存档并记录导出日期，路线页里有两处用到（提醒条和设置区）。
function doExport(ctx) {
  const today = ctx.today()
  // 导出文件里要已经带上今天的 lastExportAt，否则用这份备份恢复后会立刻又提示“还没导出过”。
  const exported = { ...ctx.state, settings: { ...ctx.state.settings, lastExportAt: today } }
  downloadJson(`drill-progress-${today}.json`, exportJson(exported))
  ctx.commit((s) => { s.settings.lastExportAt = today })
  ctx.rerender()
}

// reminderBanner 距上次导出满 7 天（或从未导出）且有进度时显示提醒。
function reminderBanner(ctx) {
  if (!needsExportReminder(ctx.state, ctx.today())) return null
  const last = ctx.state.settings.lastExportAt
  const text = last ? `距上次导出备份已满 7 天（${last}）。` : '你已经有进度，但还没有导出过备份。'
  return h('div', { class: 'notice row between' }, h('span', {}, `${text}进度只存在这个浏览器里，清除站点数据或换设备都会丢失。`), h('button', { class: 'btn primary', onclick: () => doExport(ctx) }, '立即导出'))
}

// todoSection 今日待办。
function todoSection(ctx) {
  const today = ctx.today()
  const { reviews, newItems } = todayTodo(ctx.state, ctx.data.problems, today)
  const reviewItems = reviews.items.map((r) => {
    const p = ctx.data.byId[r.id]
    const title = p ? p.title : `未知题目（${r.id}）`
    const late = daysBetween(r.due, today)
    return h('li', {}, h('a', { href: '#/review' }, title), `　第 ${r.round} 轮复习，到期 `, h('span', { class: 'nowrap' }, r.due), late > 0 ? `（逾期 ${late} 天）` : '')
  })
  const newList = newItems.map((p) => h('li', {}, h('a', { href: `#/problems?focus=${p.id}` }, p.title), `　${ctx.data.patternById[p.pattern]?.name ?? p.pattern}${p.core ? ' · 核心题' : ''}`))
  const empty = reviewItems.length === 0 && newList.length === 0
  return h('section', {},
    h('h2', {}, '今日待办'),
    h('div', { class: 'card stack' },
      empty && h('p', { class: 'muted' }, '今天没有待办。可以做一次快闪或识别训练。'),
      reviewItems.length > 0 && h('div', {}, h('h3', {}, `到期复习（${reviews.total}）`), h('ul', {}, reviewItems), reviews.total > reviews.items.length && h('p', { class: 'muted' }, `每天最多排 ${MAX_REVIEWS_PER_DAY} 道，还有 ${reviews.total - reviews.items.length} 道顺延。`)),
      newList.length > 0 && h('div', {}, h('h3', {}, '建议新题'), h('ul', {}, newList)),
      h('div', { class: 'row' }, h('a', { class: 'btn primary', href: '#/flash' }, '开始一次快闪'), h('a', { class: 'btn', href: '#/quiz' }, '识别训练'), h('a', { class: 'btn', href: '#/review' }, '去复习'))))
}

// progressSection 总体统计与四周进度。
function progressSection(ctx) {
  const stat = summarize(ctx.data.problems, ctx.state)
  const week = currentWeek(ctx.state.settings.startDate, ctx.today())
  const rows = []
  for (let w = 1; w <= MAX_WEEK; w++) {
    const { done, total } = weekProgress(ctx.data.problems, ctx.state, w)
    const names = ctx.data.patterns.filter((p) => p.week === w).map((p) => p.name).join('、')
    rows.push(h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('strong', {}, `第 ${w} 周${w === week ? '（本周）' : ''}`), h('span', { class: 'muted' }, `${done} / ${total}`)), progressBar(total ? done / total : 0, `第 ${w} 周进度`), h('div', { class: 'muted' }, names)))
  }
  return h('section', {}, h('h2', {}, '进度'), h('div', { class: 'card stack' }, h('p', {}, `共 ${stat.total} 题：已掌握 ${stat.mastered}，卡过 ${stat.stuck}，未做 ${stat.todo}。`), rows))
}

// stagesSection 三个训练阶段说明和阶段四面试节奏清单。
function stagesSection() {
  const cards = STAGES.map((s) => h('div', { class: 'card stack' }, h('h3', {}, s.title), h('p', { class: 'muted' }, s.body), h('div', { class: 'row' }, s.links.map(([label, path]) => h('a', { class: 'btn', href: `#/${path}` }, label)))))
  const steps = INTERVIEW_STEPS.map(([t, d]) => h('li', {}, h('strong', {}, t), `：${d}`))
  return h('section', {}, h('h2', {}, '训练阶段'), h('div', { class: 'grid' }, cards),
    h('h2', {}, '阶段四 · 面试现场节奏'),
    h('div', { class: 'card stack' }, h('ol', {}, steps), h('p', { class: 'muted' }, '遇到背过的原题不要秒写，放慢节奏，照样走澄清和思路，让面试官看到思考过程。')))
}

// settingsSection 设置与备份。
function settingsSection(ctx) {
  const msg = h('p', { class: 'muted', role: 'status' })
  const startInput = h('input', { type: 'date', value: ctx.state.settings.startDate, 'aria-label': '开始日期' })
  const perDayInput = h('input', { type: 'number', min: String(MIN_NEW_PER_DAY), max: String(MAX_NEW_PER_DAY), value: String(ctx.state.settings.newPerDay), 'aria-label': '每天新题数' })

  const save = () => {
    const n = Number(perDayInput.value)
    if (!isValidDate(startInput.value)) return void (msg.textContent = '请选择有效的开始日期。')
    if (!Number.isInteger(n) || n < MIN_NEW_PER_DAY || n > MAX_NEW_PER_DAY) return void (msg.textContent = `每天新题数必须是 ${MIN_NEW_PER_DAY} 到 ${MAX_NEW_PER_DAY} 的整数。`)
    const r = ctx.commit((s) => { s.settings.startDate = startInput.value; s.settings.newPerDay = n })
    if (!r.ok) return void (msg.textContent = '保存失败，见页面顶部提示。')
    ctx.rerender()
  }

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', 'aria-label': '选择备份文件',
    onchange: async () => {
      msg.textContent = ''
      const file = fileInput.files[0]
      if (!file) return
      const r = parseImport(await file.text())
      if (!r.ok) { fileInput.value = ''; msg.textContent = `导入失败：${r.error}`; return }
      const current = Object.keys(ctx.state.problems).length
      if (!window.confirm(`将用备份文件覆盖当前进度。\n文件里有 ${r.problemCount} 题的进度，当前有 ${current} 题。\n确定覆盖吗？`)) { fileInput.value = ''; return }
      const res = ctx.replaceState(r.state)
      if (!res.ok) { fileInput.value = ''; msg.textContent = `导入失败：${res.error}` }
    },
  })

  return h('section', {}, h('h2', {}, '设置与备份'),
    h('div', { class: 'card stack' },
      h('p', { class: 'muted' }, ctx.persistent ? '进度保存在本浏览器的 localStorage。清除站点数据、换浏览器或换设备都会丢失，请定期导出。' : '当前浏览器不允许保存数据，进度不会保留，请导出备份。'),
      h('div', { class: 'row' }, h('label', {}, '开始日期 ', startInput), h('label', {}, '每天新题数 ', perDayInput), h('button', { class: 'btn', onclick: save }, '保存设置')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => doExport(ctx) }, '导出进度（JSON）'), h('label', {}, '导入备份 ', fileInput)),
      msg))
}

// mount 渲染路线页。
export function mount(ctx, params, el) {
  // reminderBanner 可能返回 null；Element.append(null) 会把字符串 "null" 渲染到页面上，所以先过滤。
  const sections = [h('h1', {}, '路线'), reminderBanner(ctx), todoSection(ctx), progressSection(ctx), stagesSection(), settingsSection(ctx)]
  el.append(...sections.filter(Boolean))
}
