// 今天视图：阶段分段控件、现在该做的一步、三环进度、最近 7 天、进度概览，下面是接下来和已完成的步骤。
import { h } from './dom.js'
import { todayPlan } from '../core/today.js'
import { dueReviews } from '../core/schedule.js'
import { summarize, problemLabel } from '../core/filters.js'
import { activityByDay } from '../core/activity.js'
import { reminderBanner } from './backup.js'

const STAGES = [
  ['base', '刷新基础'],
  ['patterns', '按模式学'],
  ['interview', '面试演练'],
]
const PACE_TEXT = { ahead: '比计划快', on: '和计划一致', behind: '比计划慢' }
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const NS = 'http://www.w3.org/2000/svg'
const RING_STROKE = 13
const RING_GAP = 4

// stageStrip 三个阶段做成分段控件，当前阶段是白色滑块，点击进入完整路线。
function stageStrip(plan) {
  const at = STAGES.findIndex(([key]) => key === plan.stage)
  const stops = STAGES.map(([key, label], i) => h('li', { class: i === at ? 'now' : i < at ? 'past' : '', 'aria-current': i === at ? 'step' : null }, label))
  return h('nav', { class: 'strip', 'aria-label': '路线' }, h('ol', { class: 'segmented' }, stops), h('a', { class: 'more', href: '#/roadmap' }, '完整路线'))
}

// whereText 一句话说明现在学到哪里：阶段、当前模式、已学完的模式数，以及和计划周次的对照。
function whereText(plan, patternCount) {
  const pace = plan.pace ? `；${PACE_TEXT[plan.pace]}（计划第 ${plan.week} 周）` : ''
  if (plan.stage === 'base') return `现在在阶段 0：先把基础课过一遍${pace}。`
  if (plan.stage === 'patterns') return `现在在阶段 1：${plan.currentPattern.name}（已学完 ${plan.completedPatterns} / ${patternCount} 个模式）${pace}。`
  return '12 个模式都学完了，进入面试演练。'
}

// stepItem 清单里的一行：序号、标题、说明和入口。
function stepItem(plan, step) {
  return h('li', { class: `step ${step.state}` },
    h('span', { class: 'step-n', 'aria-hidden': 'true' }, step.state === 'done' ? '✓' : String(plan.steps.indexOf(step) + 1)),
    h('div', { class: 'todo-main' }, h('strong', {}, step.title), h('span', { class: 'sub' }, step.detail)),
    h('a', { class: 'btn', href: step.href, 'aria-label': `${step.cta}：${step.title}` }, step.cta))
}

// learnList 今天的学习清单：每一项一行，第一项是现在要做的。
function learnList(items) {
  return h('ol', { class: 'learn-list' }, items.map((it, i) => h('li', { class: i === 0 ? 'next' : '' }, h('a', { href: it.href }, it.title))))
}

// afterText “做完之后”说什么：当前步骤是学习时先看下一个学习项，否则看下一个待做的步骤。
function afterText(plan) {
  const step = plan.current
  if (step.key === 'learn' && plan.learn.items.length > 1) return `做完之后：${plan.learn.items[1].title}`
  const next = plan.upcoming[0]
  return next ? `做完之后：${next.title}` : '这是今天最后一步'
}

// currentCard 现在该做的一步：大标题和蓝色主按钮，并说明做完之后是什么。
function currentCard(plan) {
  const step = plan.current
  return h('section', { class: 'card now-card', 'aria-label': '现在该做的一步' },
    h('span', { class: 'eyebrow' }, `现在 · 第 ${plan.steps.indexOf(step) + 1} 步 / 共 ${plan.steps.length} 步`),
    h('h2', { class: 'title' }, step.title),
    // 学习步骤有多项时，下面的清单已经列出了第一项，不再重复“下一项”。
    step.key === 'learn' && plan.learn.items.length > 1 ? learnList(plan.learn.items) : h('p', { class: 'muted' }, step.detail),
    h('div', { class: 'row cta-row' },
      h('a', { class: 'btn primary big', href: step.href }, step.cta),
      h('span', { class: 'muted' }, afterText(plan))))
}

// extraLine 今天做完后的加练建议。
function extraLine(ctx, plan) {
  if (!plan.extra) return null
  return h('p', { class: 'muted' }, '还想多练：', h('a', { href: `#/problems?focus=${plan.extra.id}` }, problemLabel(plan.extra)), `（${ctx.data.patternById[plan.extra.pattern]?.name ?? plan.extra.pattern}，加练题，不影响进度）`)
}

// completeCard 今天的步骤全部完成：说明明天有多少复习，并顺带给出加练建议和每周一次的识别训练。
function completeCard(ctx, plan) {
  const quiz = plan.weeklyQuiz
  return h('section', { class: 'card now-card ok', 'aria-label': '今天已完成' },
    h('span', { class: 'eyebrow' }, '今天完成'),
    h('h2', { class: 'title' }, '今天的训练做完了'),
    h('p', { class: 'muted' }, plan.tomorrowDue > 0 ? `明天有 ${plan.tomorrowDue} 道复习到期。` : '明天没有到期的复习。'),
    extraLine(ctx, plan),
    quiz && quiz.state === 'pending' && h('div', { class: 'row' }, h('span', {}, `${quiz.title}：${quiz.detail}`), h('a', { class: 'btn', href: quiz.href }, quiz.cta)))
}

// svgEl 创建带属性的 SVG 元素。
function svgEl(tag, attrs) {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

// ringsCard 三环进度卡：外环今日学习、中环课程、内环题单，圆环载入时从 0 画到当前进度。
function ringsCard(ctx, plan, stat) {
  const lessonsDone = Object.keys(ctx.state.lessons).length
  const items = [
    { key: 'today', label: '今日学习', done: plan.learn.doneToday, total: Math.max(plan.learn.budget, 1) },
    { key: 'lessons', label: '课程', done: lessonsDone, total: ctx.data.lessons.length },
    { key: 'problems', label: '题单', done: stat.mastered + stat.stuck, total: stat.total },
  ]
  const size = 168
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'rings-svg', 'aria-hidden': 'true' })
  items.forEach((it, i) => {
    const r = size / 2 - RING_STROKE / 2 - i * (RING_STROKE + RING_GAP)
    const c = 2 * Math.PI * r
    const ratio = it.total > 0 ? Math.min(1, it.done / it.total) : 0
    svg.append(
      svgEl('circle', { cx: size / 2, cy: size / 2, r, class: `ring-track r-${it.key}`, 'stroke-width': RING_STROKE }),
      svgEl('circle', { cx: size / 2, cy: size / 2, r, class: `ring-fill r-${it.key}`, 'stroke-width': RING_STROKE, 'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - ratio), style: `--c:${c}` }))
  })
  const legend = items.map((it) => h('li', {}, h('i', { class: `dot-key r-${it.key}` }), h('span', {}, it.label), h('b', {}, `${it.done}`, h('small', {}, ` / ${it.total}`))))
  return h('section', { class: 'card rings-card', 'aria-label': '进度三环' },
    h('div', { class: 'rings', role: 'img', 'aria-label': items.map((it) => `${it.label} ${it.done} / ${it.total}`).join('，') }, svg),
    h('ul', { class: 'rings-legend' }, legend))
}

// weekCard 最近 7 天的柱状图：柱高是当天完成的项数，今天用蓝色。
function weekCard(ctx, today) {
  const days = activityByDay(ctx.state, today, 7)
  const max = Math.max(1, ...days.map((d) => d.count))
  const total = days.reduce((n, d) => n + d.count, 0)
  const active = days.filter((d) => d.count > 0).length
  const bars = days.map((d) => {
    const weekday = WEEKDAYS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]
    return h('li', { class: `day${d.isToday ? ' today' : ''}${d.count === 0 ? ' empty' : ''}`, title: `${d.date}：${d.count} 项` },
      h('span', { class: 'day-n' }, d.count > 0 ? String(d.count) : ''),
      h('span', { class: 'day-bar', style: `height:${d.count === 0 ? 8 : 16 + Math.round((d.count / max) * 84)}px` }),
      h('span', { class: 'day-l' }, weekday))
  })
  return h('section', { class: 'card week-card', 'aria-label': '最近 7 天' },
    h('div', { class: 'card-head' }, h('h3', {}, '最近 7 天'), h('p', { class: 'muted' }, `${active} 天有练习，共 ${total} 项`)),
    h('ul', { class: 'days' }, bars))
}

// statCard 一张统计卡：大数字加说明。
function statCard(cls, n, label, link) {
  return h('section', { class: `card stat ${cls}` },
    h('div', { class: 'stat-n' }, String(n)),
    h('div', { class: 'stat-l' }, label),
    link && h('a', { class: 'more', href: link.href }, link.text))
}

// progressCard 题单进度：掌握、卡过、未做三段进度条。
function progressCard(stat) {
  const pct = (n) => (stat.total ? (n / stat.total) * 100 : 0)
  const dot = (color) => h('b', { style: `background:${color}` })
  return h('section', { class: 'card progress-card', 'aria-label': '题单进度' },
    h('div', { class: 'card-head' }, h('h3', {}, '题单进度'), h('p', { class: 'muted' }, `已做 ${stat.mastered + stat.stuck} / ${stat.total} 道`)),
    h('div', { class: 'bar', role: 'img', 'aria-label': `已掌握 ${stat.mastered}，卡过 ${stat.stuck}，未做 ${stat.todo}` },
      h('i', { class: 'm', style: `width:${pct(stat.mastered)}%` }), h('i', { class: 's', style: `width:${pct(stat.stuck)}%` })),
    h('div', { class: 'legend' },
      h('span', {}, dot('var(--ok-dot)'), `已掌握 ${stat.mastered}`),
      h('span', {}, dot('var(--stuck-dot)'), `卡过 ${stat.stuck}`),
      h('span', {}, dot('var(--dot-todo)'), `未做 ${stat.todo}`)))
}

// bento 拼出今天页的卡片网格。
function bento(ctx, plan, today, stat, due) {
  return h('div', { class: 'bento' },
    plan.complete ? completeCard(ctx, plan) : currentCard(plan),
    ringsCard(ctx, plan, stat),
    weekCard(ctx, today),
    statCard('ok', stat.mastered, '已掌握'),
    statCard('stuck', stat.stuck, '卡过，需要复习'),
    progressCard(stat),
    statCard('due', due, '今日到期复习', due > 0 ? { href: '#/review', text: '去复习' } : null))
}

// mount 渲染今天页。
export function mount(ctx, params, el) {
  const today = ctx.today()
  const plan = todayPlan(ctx.state, ctx.data, today)
  const stat = summarize(ctx.data.problems, ctx.state)
  const due = dueReviews(ctx.state, today).total
  const since = plan.day >= 1 ? `开始后的第 ${plan.day} 天` : `开始日期是 ${ctx.state.settings.startDate}`
  const quiz = plan.weeklyQuiz
  // 可能为 null 或 false 的段落先过滤：Element.append(null) 会把字面量 "null" 渲染到页面上。
  const sections = [
    h('p', { class: 'eyebrow date' }, `${today}${plan.weekend ? ' · 周末' : ''} · ${since}`),
    h('h1', {}, '今天'),
    reminderBanner(ctx),
    stageStrip(plan),
    h('p', { class: 'muted where' }, whereText(plan, ctx.data.patterns.length)),
    bento(ctx, plan, today, stat, due),
    plan.upcoming.length > 0 && h('section', {}, h('h2', {}, '接下来'), h('ol', { class: 'steps card' }, plan.upcoming.map((s) => stepItem(plan, s)))),
    !plan.complete && quiz && quiz.state === 'pending' && h('p', { class: 'muted' }, `${quiz.title}：${quiz.detail}`, ' ', h('a', { class: 'more', href: quiz.href }, quiz.cta)),
    plan.done.length > 0 && h('details', { class: 'done-list', open: plan.complete }, h('summary', {}, `已完成 ${plan.done.length} 项`), h('ol', { class: 'steps card' }, plan.done.map((s) => stepItem(plan, s))))]
  el.append(...sections.filter(Boolean))
}
