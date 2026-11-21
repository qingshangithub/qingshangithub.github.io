// 今日清单：把“今天该做什么、先做哪个”推导成有序的步骤。纯函数，不依赖 DOM，完成情况全部从存档推出，不新增存储。
import { addDays, daysBetween, isWeekend } from './dates.js'
import { currentWeek, dueReviews, upcomingReviews } from './schedule.js'
import { FLASH_UNLOCK_PATTERNS, QUIZ_UNLOCK_PATTERNS, learningProgress, learningQueue } from './learning.js'

export const WEEKLY_QUIZ_DAYS = 7
const INTERVIEW_PACE_WEEK = 1 // 阶段 0 的计划周次

// reviewStep 复习到期的题：有到期的是待做；今天通过过且已没有到期的是完成；其余情况不出现。
function reviewStep(state, todayStr) {
  const due = dueReviews(state, todayStr)
  if (due.total > 0) {
    const more = due.total > due.items.length ? `；另有 ${due.total - due.items.length} 道顺延到明天以后` : ''
    return { key: 'review', state: 'pending', title: `复习到期的题（${due.items.length} 道）`, detail: `不看题解，从空白重写，15 分钟内写对才算通过${more}。`, href: '#/review', cta: '去复习' }
  }
  const doneToday = Object.values(state.problems).flatMap((e) => e.reviews).filter((r) => r.doneAt === todayStr).length
  if (doneToday > 0) return { key: 'review', state: 'done', title: '复习到期的题', detail: `今天已复习 ${doneToday} 道。`, href: '#/review', cta: '去复习' }
  return null
}

// learnedToday 今天已经完成的学习项数：学完的课（跳过不算）、做完的题、默写的模板卡。
function learnedToday(state, todayStr) {
  const lessons = Object.values(state.lessons).filter((l) => l.doneAt === todayStr && !l.skipped).length
  const problems = Object.values(state.problems).filter((e) => e.firstDoneAt === todayStr).length
  const templates = Object.values(state.templates).filter((t) => t.lastRecitedAt === todayStr).length
  return lessons + problems + templates
}

// learnStep 今天的学习：预算是工作日 newPerDay、周末 weekendPerDay；items 是还要做的学习项。
// 队列空了且今天没学过就没有这一步；达到预算后是完成，但队列里还有的话可以继续往下学。
function learnStep(queue, doneToday, budget) {
  const remaining = Math.max(0, budget - doneToday)
  const items = queue.slice(0, remaining)
  if (queue.length === 0 && doneToday === 0) return { step: null, items }
  const title = `今天的学习（${doneToday} / ${budget}）`
  if (items.length > 0) {
    return { step: { key: 'learn', state: 'pending', title, detail: `下一项：${items[0].title}`, href: items[0].href, cta: items[0].cta, items }, items }
  }
  const more = queue[0]
  const detail = more ? `今天的学习预算用完了（已学 ${doneToday} 项）。想多学可以继续：${more.title}。` : `今天已学 ${doneToday} 项，所有内容都学完了。`
  return { step: { key: 'learn', state: 'done', title, detail, href: more ? more.href : '#/roadmap', cta: more ? '再学一项' : '看路线', items: [] }, items }
}

// flashStep 15 分钟快闪：今天有记录就完成。
function flashStep(state, todayStr) {
  const n = state.flash.filter((f) => f.date === todayStr).length
  if (n > 0) return { key: 'flash', state: 'done', title: '15 分钟快闪', detail: `今天已完成 ${n} 次。`, href: '#/flash', cta: '再来一次' }
  return { key: 'flash', state: 'pending', title: '15 分钟快闪', detail: '选一道已经认识的题：读题 2、设计 2、编码 8、验证 3 分钟。', href: '#/flash', cta: '开始快闪' }
}

// weeklyQuiz 识别训练每周一次：今天做过是完成；7 天内做过不提示；从没做过或距上次满 7 天是待做。不计入“今天是否完成”。
function weeklyQuiz(state, todayStr) {
  const last = state.recognition.map((r) => r.date).sort().at(-1)
  const base = { key: 'quiz', title: '识别训练（每周一次）', href: '#/quiz' }
  if (last === todayStr) return { ...base, state: 'done', detail: '今天做过了。', cta: '再来一轮' }
  if (last !== undefined && daysBetween(last, todayStr) < WEEKLY_QUIZ_DAYS) return { ...base, state: 'idle', detail: `上次是 ${last}。`, cta: '再来一轮' }
  const detail = last ? `距上次（${last}）已满 ${WEEKLY_QUIZ_DAYS} 天。` : '还没做过。每题 30 秒，只判断是哪种模式。'
  return { ...base, state: 'pending', detail, cta: '去练习' }
}

// paceOf 把学习进度和计划周次对照：在学的内容的计划周次比今天的计划周次晚是 ahead，早是 behind，相同是 on；面试演练阶段不比较。
function paceOf(stage, currentPattern, planWeek) {
  if (stage === 'interview') return null
  const target = stage === 'base' ? INTERVIEW_PACE_WEEK : currentPattern.week
  if (target > planWeek) return 'ahead'
  return target < planWeek ? 'behind' : 'on'
}

// extraProblem 加练建议：当前模式及更早的模式里第一道还没做的非核心题；基础阶段不建议。
function extraProblem(state, problems, patterns, progress) {
  if (progress.stage === 'base') return null
  const limit = progress.currentPattern ? progress.currentPattern.order : Infinity
  const orderOf = new Map(patterns.map((p) => [p.id, p.order]))
  const candidates = problems
    .filter((p) => !p.core && !Object.hasOwn(state.problems, p.id) && (orderOf.get(p.pattern) ?? Infinity) <= limit)
    .sort((a, b) => a.seq - b.seq)
  return candidates[0] ?? null
}

// todayPlan 汇总今天的有序清单。
// steps 按固定顺序：复习、今天的学习、快闪；不适用的步骤不出现。
// current 是第一个待做的步骤，upcoming 是它后面还没做的步骤，done 是已完成的步骤；全部完成时 complete 为真、current 为 null。
// data 是 { problems, patterns, lessons }。
export function todayPlan(state, data, todayStr) {
  const progress = learningProgress(state, data)
  const queue = learningQueue(state, data)
  const weekend = isWeekend(todayStr)
  const budget = weekend ? state.settings.weekendPerDay : state.settings.newPerDay
  const doneToday = learnedToday(state, todayStr)
  const learn = learnStep(queue, doneToday, budget)
  const flashOpen = progress.completedPatterns >= FLASH_UNLOCK_PATTERNS && (weekend || progress.stage === 'interview')
  const steps = [reviewStep(state, todayStr), learn.step, flashOpen ? flashStep(state, todayStr) : null].filter(Boolean)
  const currentIndex = steps.findIndex((s) => s.state === 'pending')
  const planWeek = currentWeek(state.settings.startDate, todayStr)
  const complete = currentIndex < 0
  return {
    day: daysBetween(state.settings.startDate, todayStr) + 1,
    week: planWeek,
    weekend,
    stage: progress.stage,
    currentPattern: progress.currentPattern,
    completedPatterns: progress.completedPatterns,
    pace: paceOf(progress.stage, progress.currentPattern, planWeek),
    steps,
    current: complete ? null : steps[currentIndex],
    upcoming: complete ? [] : steps.slice(currentIndex + 1).filter((s) => s.state === 'pending'),
    done: steps.filter((s) => s.state === 'done'),
    complete,
    learn: { budget, doneToday, items: learn.items },
    extra: complete ? extraProblem(state, data.problems, data.patterns, progress) : null,
    weeklyQuiz: progress.completedPatterns >= QUIZ_UNLOCK_PATTERNS ? weeklyQuiz(state, todayStr) : null,
    tomorrowDue: upcomingReviews(state, todayStr, 1).filter((r) => r.due === addDays(todayStr, 1)).length,
  }
}
