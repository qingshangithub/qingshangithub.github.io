// 路线视图：三个阶段的全貌（基础课、12 个模式、面试演练）、每天怎么排、训练方法、面试节奏、设置与备份。
import { h, progressBar } from './dom.js'
import { learningProgress } from '../core/learning.js'
import { parseImport } from '../core/store.js'
import { isValidDate } from '../core/dates.js'
import { doExport } from './backup.js'

const MIN_NEW_PER_DAY = 1
const MAX_NEW_PER_DAY = 20

const STAGES = [
  { title: '方法一 · 把模板刻进手指', body: '12 个高频模式，每个模式依次是讲解、核心题、模板卡默写。默写时先遮住实现、只看函数签名。', links: [['模板卡', 'templates'], ['题单', 'problems']] },
  { title: '方法二 · 限时快闪', body: '读题 2 分钟、设计 2 分钟、编码 8 分钟、验证 3 分钟。学完 3 个模式后周末安排；学完 5 个模式后每周一次识别训练。', links: [['练习', 'practice']] },
  { title: '方法三 · 间隔复习', body: '做完后第 3、7、21 天从空白重写。顺畅的非核心题只复习一次，卡过的题和核心题走满三轮。', links: [['复习', 'review']] },
]

const INTERVIEW_STEPS = [
  ['澄清（1 到 2 分钟）', '复述题目，确认输入输出、边界和复杂度要求。'],
  ['思路（2 到 3 分钟）', '至少说两种思路并比较，再选一个。'],
  ['边界（30 秒）', '编码前列出空输入、单元素、重复元素、溢出或越界。'],
  ['编码（5 到 15 分钟）', '边写边说；卡住时说出卡在哪里，不要沉默超过 15 秒。'],
  ['验证（2 到 3 分钟）', '拿一个小例子出声走一遍，不要问“这样应该对吧”。'],
  ['优化（1 到 2 分钟）', '主动说出时间和空间复杂度，给一个优化方向。'],
]

const STATUS_TEXT = { done: '已学完', now: '进行中', todo: '未开始' }

// stageZero 阶段 0：10 节基础课，列出每一课和完成情况。
function stageZero(ctx, progress) {
  const done = progress.base.filter((b) => b.done).length
  const rows = progress.base.map(({ lesson, done: ok }) => {
    const rec = ctx.state.lessons[lesson.id]
    const mark = ok ? (rec?.skipped ? '已跳过' : '已学完') : `约 ${lesson.minutes} 分钟`
    return h('li', { class: `lesson-row${ok ? ' done' : ''}` },
      h('span', { class: 'step-n', 'aria-hidden': 'true' }, ok ? '✓' : String(lesson.order)),
      h('a', { href: `#/learn?id=${lesson.id}` }, lesson.title), h('span', { class: 'muted' }, mark))
  })
  return h('section', {},
    h('h2', {}, `阶段 0 · 刷新基础（${done} / ${progress.base.length}）`),
    h('div', { class: 'card stack' },
      h('p', { class: 'muted' }, '学过但忘了：每课一屏，加一段能跑的 Go 示例。已经会的点“我已经会了，跳过”。计划 1 周。'),
      h('ol', { class: 'lesson-list' }, rows)))
}

// stageOne 阶段 1：12 个模式的时间线，当前模式高亮；每个模式显示计划周次、核心题完成数和入口。
function stageOne(ctx, progress) {
  const items = progress.patterns.map((p) => {
    const kind = p.complete ? 'past' : p.pattern.id === progress.currentPattern?.id && progress.stage === 'patterns' ? 'now' : 'future'
    const status = p.complete ? 'done' : kind === 'now' ? 'now' : 'todo'
    const total = ctx.data.problems.filter((q) => q.pattern === p.pattern.id).length
    const coreTotal = ctx.data.problems.filter((q) => q.pattern === p.pattern.id && q.core).length
    const coreDone = coreTotal - p.coreUndone.length
    return h('li', { class: `route-item ${kind}`, 'aria-current': kind === 'now' ? 'step' : null },
      h('span', { class: 'route-n', 'aria-hidden': 'true' }, p.complete ? '✓' : String(p.pattern.order)),
      h('div', { class: 'route-body card' },
        h('div', { class: 'row between' }, h('strong', {}, p.pattern.name), h('span', { class: `tag${status === 'now' ? '' : ' plain'}` }, STATUS_TEXT[status])),
        h('div', { class: 'row muted' }, h('span', {}, `计划第 ${p.pattern.week} 周`), h('span', {}, `核心题 ${coreDone} / ${coreTotal}`), h('span', {}, `共 ${total} 题，其余加练`)),
        progressBar(coreTotal ? coreDone / coreTotal : 0, `${p.pattern.name}核心题进度`),
        h('div', { class: 'row' },
          p.lesson && h('a', { class: 'chip', href: `#/learn?id=${p.lesson.id}` }, p.lessonPending ? '讲解' : '讲解（已学）'),
          !p.lesson && h('span', { class: 'muted' }, '讲解稍后补充'),
          h('a', { class: 'chip', href: `#/problems?pattern=${p.pattern.id}` }, '题单'),
          h('a', { class: 'chip', href: `#/templates?id=${p.pattern.id}` }, p.templateDone ? '模板卡（已默写）' : '模板卡'))))
  })
  return h('section', {},
    h('h2', {}, `阶段 1 · 按模式学（${progress.completedPatterns} / ${progress.patterns.length}）`),
    h('p', { class: 'muted' }, '按由易到难排。每个模式依次是：讲解、核心题、默写模板卡；三项都做完才算学完，非核心题是加练。'),
    h('ol', { class: 'route' }, items))
}

// stageTwo 阶段 2：面试演练的说明。
function stageTwo(progress) {
  return h('section', {}, h('h2', {}, '阶段 2 · 面试演练'),
    h('div', { class: `card stack${progress.stage === 'interview' ? ' now-card' : ''}` },
      h('p', {}, '12 个模式都学完后：每天一次 15 分钟快闪，每周一次识别训练，并按下面的面试节奏演练。'),
      h('a', { class: 'btn', href: '#/practice' }, '去练习')))
}

// dailySection 每天怎么排：预算来自设置。
function dailySection(ctx) {
  const { newPerDay, weekendPerDay } = ctx.state.settings
  return h('section', {},
    h('h2', {}, '每天怎么排'),
    h('div', { class: 'card stack' },
      h('ul', {},
        h('li', {}, h('strong', {}, '先做到期的复习'), '：做完一题后第 3、7、21 天各复习一轮，从空白重写。'),
        h('li', {}, h('strong', {}, '再学新内容'), `：工作日 ${newPerDay} 项，周末每天 ${weekendPerDay} 项（课、核心题、模板卡各算一项，可在下面的设置里改）。`),
        h('li', {}, h('strong', {}, '学完 3 个模式后'), '：周末加一次 15 分钟快闪。'),
        h('li', {}, h('strong', {}, '学完 5 个模式后'), '：每周一次识别训练。')),
      h('a', { class: 'btn primary', href: '#/today' }, '去“今天”看现在该做哪一步')))
}

// stagesSection 三个训练方法：为什么这样排。
function stagesSection() {
  const cards = STAGES.map((s) => h('div', { class: 'card stack' }, h('h3', {}, s.title), h('p', { class: 'muted' }, s.body), h('div', { class: 'row' }, s.links.map(([label, path]) => h('a', { class: 'btn', href: `#/${path}` }, label)))))
  return h('section', {}, h('h2', {}, '训练方法：为什么这样排'), h('div', { class: 'grid' }, cards))
}

// interviewSection 面试现场节奏清单。
function interviewSection() {
  const steps = INTERVIEW_STEPS.map(([t, d]) => h('li', {}, h('strong', {}, t), `：${d}`))
  return h('section', {}, h('h2', {}, '面试现场节奏'),
    h('div', { class: 'card stack' }, h('ol', {}, steps), h('p', { class: 'muted' }, '遇到背过的原题不要秒写，放慢节奏，照样走澄清和思路，让面试官看到思考过程。')))
}

// settingsSection 设置与备份。
function settingsSection(ctx) {
  const msg = h('p', { class: 'muted', role: 'status' })
  const startInput = h('input', { type: 'date', value: ctx.state.settings.startDate, 'aria-label': '开始日期' })
  const perDayInput = h('input', { type: 'number', min: String(MIN_NEW_PER_DAY), max: String(MAX_NEW_PER_DAY), value: String(ctx.state.settings.newPerDay), 'aria-label': '工作日每天学习项数' })
  const weekendInput = h('input', { type: 'number', min: String(MIN_NEW_PER_DAY), max: String(MAX_NEW_PER_DAY), value: String(ctx.state.settings.weekendPerDay), 'aria-label': '周末每天学习项数' })

  const save = () => {
    const n = Number(perDayInput.value)
    const w = Number(weekendInput.value)
    if (!isValidDate(startInput.value)) return void (msg.textContent = '请选择有效的开始日期。')
    const outOfRange = (x) => !Number.isInteger(x) || x < MIN_NEW_PER_DAY || x > MAX_NEW_PER_DAY
    if (outOfRange(n) || outOfRange(w)) return void (msg.textContent = `每天学习项数必须是 ${MIN_NEW_PER_DAY} 到 ${MAX_NEW_PER_DAY} 的整数。`)
    const r = ctx.commit((s) => { s.settings.startDate = startInput.value; s.settings.newPerDay = n; s.settings.weekendPerDay = w })
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
      h('div', { class: 'row' }, h('label', {}, '开始日期 ', startInput), h('label', {}, '工作日每天学习项数 ', perDayInput), h('label', {}, '周末每天学习项数 ', weekendInput), h('button', { class: 'btn', onclick: save }, '保存设置')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => doExport(ctx) }, '导出进度（JSON）'), h('label', {}, '导入备份 ', fileInput)),
      msg))
}

// mount 渲染路线页。
export function mount(ctx, params, el) {
  const progress = learningProgress(ctx.state, ctx.data)
  el.append(
    h('h1', {}, '路线'),
    h('p', { class: 'subtitle' }, '三个阶段：先刷新基础，再按模式学，最后面试演练。每天具体做什么，看“今天”页。'),
    stageZero(ctx, progress), stageOne(ctx, progress), stageTwo(progress),
    dailySection(ctx), stagesSection(), interviewSection(), settingsSection(ctx))
}
