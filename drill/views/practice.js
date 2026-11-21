// 练习视图：快闪、识别训练、复习三种训练的入口和各自的使用时机。
import { h } from './dom.js'
import { dueReviews } from '../core/schedule.js'
import { learningProgress, FLASH_UNLOCK_PATTERNS, QUIZ_UNLOCK_PATTERNS } from '../core/learning.js'

// lastDate 返回一组带 date 字段的记录里最近的日期，没有记录返回 null。
function lastDate(records) {
  return records.map((r) => r.date).sort().at(-1) ?? null
}

// practiceCard 一张训练卡：名称、什么时候用、做什么、上次情况和入口。
function practiceCard({ title, when, what, status, href, cta }) {
  return h('div', { class: 'card practice' },
    h('h3', {}, title),
    h('p', {}, h('strong', {}, '什么时候用：'), when),
    h('p', { class: 'muted' }, what),
    h('p', { class: 'muted' }, status),
    h('a', { class: 'btn primary', href }, cta))
}

// mount 渲染练习页。
export function mount(ctx, params, el) {
  const due = dueReviews(ctx.state, ctx.today()).total
  const flashLast = lastDate(ctx.state.flash)
  const quizLast = lastDate(ctx.state.recognition)
  const done = learningProgress(ctx.state, ctx.data).completedPatterns
  // lockNote 还没学够模式时说明“今天”页什么时候才会安排，但不拦着想提前练的人。
  const lockNote = (need) => (done >= need ? '' : `“今天”页要学完 ${need} 个模式才会安排（现在 ${done} 个），想提前练也可以。`)
  el.append(
    h('h1', {}, '练习'),
    h('p', { class: 'subtitle' }, '复习会自动出现在“今天”页；快闪和识别训练要学完几个模式后才会被安排。想单独练哪一种，可以从这里直接开始。'),
    h('div', { class: 'grid' },
      practiceCard({
        title: '复习',
        when: '每天先做。做完一题后第 3、7、21 天到期。',
        what: '不看题解和模板，从空白重写；15 分钟内写出可运行、通过边界检查的代码才算通过。',
        status: due > 0 ? `现在有 ${due} 道到期。` : '现在没有到期的复习。',
        href: '#/review', cta: '去复习',
      }),
      practiceCard({
        title: '快闪',
        when: '学完 3 个模式后，每个周末一次；选一道已经认识的题。',
        what: '15 分钟倒计时：读题 2、设计 2、编码 8、验证 3 分钟，前 5 分钟不碰键盘。结束后写三行复盘。',
        status: `${flashLast ? `上次快闪：${flashLast}。` : '还没做过快闪。'}${lockNote(FLASH_UNLOCK_PATTERNS)}`,
        href: '#/flash', cta: '开始快闪',
      }),
      practiceCard({
        title: '识别训练',
        when: '学完 5 个模式后，每周一次。想练“看到题就想到模式”时用。',
        what: '随机抽 5 到 8 题，每题 30 秒内从 4 个模式里选一个，不写代码。',
        status: `${quizLast ? `上次识别训练：${quizLast}。` : '还没做过识别训练。'}${lockNote(QUIZ_UNLOCK_PATTERNS)}`,
        href: '#/quiz', cta: '开始练习',
      })))
}
