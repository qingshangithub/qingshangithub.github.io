// 今天视图：阶段缩略、现在该做的一步、接下来的步骤、已完成的步骤，底部是进度概览。
import { h } from './dom.js'
import { todayPlan } from '../core/today.js'
import { dueReviews } from '../core/schedule.js'
import { summarize, problemLabel } from '../core/filters.js'
import { reminderBanner } from './backup.js'

const STAGES = [
  ['base', '阶段 0 · 刷新基础'],
  ['patterns', '阶段 1 · 按模式学'],
  ['interview', '阶段 2 · 面试演练'],
]
const PACE_TEXT = { ahead: '比计划快', on: '和计划一致', behind: '比计划慢' }

// stageStrip 三个阶段的缩略，当前阶段高亮，点击进入完整路线。
function stageStrip(plan) {
  const at = STAGES.findIndex(([key]) => key === plan.stage)
  const stops = STAGES.map(([key, label], i) => h('li', { class: i === at ? 'now' : i < at ? 'past' : '', 'aria-current': i === at ? 'step' : null }, label))
  return h('nav', { class: 'strip', 'aria-label': '路线' }, h('ol', {}, stops), h('a', { href: '#/roadmap' }, '看完整路线'))
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

// currentCard 现在该做的一步：大按钮，并说明做完之后是什么。
function currentCard(plan) {
  const step = plan.current
  return h('section', { class: 'card now-card', 'aria-label': '现在该做的一步' },
    h('span', { class: 'tag' }, `现在 · 第 ${plan.steps.indexOf(step) + 1} 步 / 共 ${plan.steps.length} 步`),
    h('h2', { class: 'title' }, step.title),
    // 学习步骤有多项时，下面的清单已经列出了第一项，不再重复“下一项”。
    step.key === 'learn' && plan.learn.items.length > 1 ? learnList(plan.learn.items) : h('p', { class: 'muted' }, step.detail),
    h('div', { class: 'row' },
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
    h('span', { class: 'tag' }, '今天完成'),
    h('h2', { class: 'title' }, '今天的训练做完了'),
    h('p', { class: 'muted' }, plan.tomorrowDue > 0 ? `明天有 ${plan.tomorrowDue} 道复习到期。` : '明天没有到期的复习。'),
    extraLine(ctx, plan),
    quiz && quiz.state === 'pending' && h('div', { class: 'row' }, h('span', {}, `${quiz.title}：${quiz.detail}`), h('a', { class: 'btn', href: quiz.href }, quiz.cta)))
}

// overviewSection 底部的进度概览：四张统计卡和一条三色进度条。
function overviewSection(ctx) {
  const stat = summarize(ctx.data.problems, ctx.state)
  const due = dueReviews(ctx.state, ctx.today()).total
  const started = stat.mastered + stat.stuck
  const pct = (n) => (stat.total ? (n / stat.total) * 100 : 0)
  const card = (cls, n, total, label) => h('div', { class: `card stat ${cls}` },
    h('div', { class: 'stat-n' }, String(n), total !== null && h('small', {}, `/ ${total}`)),
    h('div', { class: 'stat-l' }, label))
  const dot = (color) => h('b', { style: `background:${color}` })
  return h('section', {},
    h('h2', {}, '进度概览'),
    h('div', { class: 'stats' },
      card('', started, stat.total, '已做题目'),
      card('ok', stat.mastered, null, '已掌握'),
      card('stuck', stat.stuck, null, '卡过，需要复习'),
      card('due', due, null, '今日到期复习')),
    h('div', { class: 'card', style: 'margin-top:14px' },
      h('div', { class: 'bar', role: 'img', 'aria-label': `已掌握 ${stat.mastered}，卡过 ${stat.stuck}，未做 ${stat.todo}` },
        h('i', { class: 'm', style: `width:${pct(stat.mastered)}%` }), h('i', { class: 's', style: `width:${pct(stat.stuck)}%` })),
      h('div', { class: 'legend' },
        h('span', {}, dot('var(--ok-dot)'), `已掌握 ${stat.mastered}`),
        h('span', {}, dot('var(--stuck-dot)'), `卡过 ${stat.stuck}`),
        h('span', {}, dot('var(--dot-todo)'), `未做 ${stat.todo}`))))
}

// mount 渲染今天页。
export function mount(ctx, params, el) {
  const today = ctx.today()
  const plan = todayPlan(ctx.state, ctx.data, today)
  const since = plan.day >= 1 ? `开始后的第 ${plan.day} 天` : `开始日期是 ${ctx.state.settings.startDate}`
  const quiz = plan.weeklyQuiz
  // 可能为 null 或 false 的段落先过滤：Element.append(null) 会把字面量 "null" 渲染到页面上。
  const sections = [
    h('h1', {}, '今天'),
    h('p', { class: 'subtitle' }, `${today}${plan.weekend ? '（周末）' : ''} · ${since}`),
    reminderBanner(ctx),
    stageStrip(plan),
    h('p', { class: 'muted where' }, whereText(plan, ctx.data.patterns.length)),
    plan.complete ? completeCard(ctx, plan) : currentCard(plan),
    plan.upcoming.length > 0 && h('section', {}, h('h2', {}, '接下来'), h('ol', { class: 'steps card' }, plan.upcoming.map((s) => stepItem(plan, s)))),
    !plan.complete && quiz && quiz.state === 'pending' && h('p', { class: 'muted' }, `${quiz.title}：${quiz.detail}`, ' ', h('a', { href: quiz.href }, quiz.cta)),
    plan.done.length > 0 && h('details', { class: 'done-list', open: plan.complete }, h('summary', {}, `已完成 ${plan.done.length} 项`), h('ol', { class: 'steps card' }, plan.done.map((s) => stepItem(plan, s)))),
    overviewSection(ctx)]
  el.append(...sections.filter(Boolean))
}
