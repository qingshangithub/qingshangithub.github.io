// 识别训练视图：30 秒内选出题目对应的模式。
import { h, clear } from './dom.js'
import { buildQuiz, scoreQuiz, makeRecognitionRecord, QUIZ_SECONDS_PER_QUESTION, QUIZ_MIN, QUIZ_MAX } from '../core/quiz.js'
import { LEVEL_LABELS } from '../core/filters.js'

const DEFAULT_COUNT = 6
const HISTORY_SIZE = 5
const MS_PER_SECOND = 1000
const PERCENT = 100
const TICK_MS = 250
// 剩余 10 秒时给读屏软件播报一次。
const WARNING_SECONDS = 10
// 题目刚出现 400 毫秒内忽略选项点击：快速双击“下一题”时，第二下会落在下一题同一位置的选项上，直接把新题答掉。超时（null）不受限制。
const ANSWER_GUARD_MS = 400

// mount 挂载识别训练视图，返回清理函数。
export function mount(ctx, params, el) {
  let phase = 'setup' // setup | question | result
  let count = DEFAULT_COUNT
  let quiz = []
  let answers = []
  let index = 0
  let revealed = false
  let secondsLeft = 0
  let deadline = 0
  let shownAt = 0
  let warned = false
  let result = null
  let saveOk = true
  let dataError = null
  let countdownId = null
  let live = null

  const root = h('div', { class: 'stack' })
  // status 放在会被重绘的 root 之外，读屏软件才会把文字变化当作播报；只在换题、剩余 10 秒和判题时更新，不随每秒倒计时刷新。
  const status = h('p', { class: 'sr-only', role: 'status' })

  const stopCountdown = () => { if (countdownId !== null) { clearInterval(countdownId); countdownId = null } }
  const resetAnnounce = () => { status.textContent = '' }

  // start 抽题并开始第一题。
  function start() {
    try {
      quiz = buildQuiz(ctx.data.problems, ctx.data.patterns, count)
    } catch (e) {
      // 题库里有题目引用了不存在的模式时 buildQuiz 会抛错；留在设置页并把原因显示出来，不能让“开始”按钮毫无反应。
      dataError = e.message
      draw('#quiz-data-error')
      return
    }
    dataError = null
    answers = []
    index = 0
    phase = 'question'
    beginQuestion()
  }

  // beginQuestion 重置本题状态，按截止时间启动 30 秒倒计时。
  function beginQuestion() {
    revealed = false
    warned = false
    secondsLeft = QUIZ_SECONDS_PER_QUESTION
    deadline = Date.now() + QUIZ_SECONDS_PER_QUESTION * MS_PER_SECOND
    stopCountdown()
    countdownId = setInterval(tick, TICK_MS)
    status.textContent = `第 ${index + 1} / ${quiz.length} 题`
    draw('.option')
    shownAt = performance.now()
  }

  // tick 按截止时间算剩余秒数（后台标签页的定时器会被降频，不能靠累减）；到 0 视为未作答。
  function tick() {
    if (phase !== 'question' || revealed) return
    // 系统时间被往回拨时，原截止时间会比 30 秒更远，显示会超过 30 秒；每次都把截止时间压到“现在起 30 秒”以内。
    const now = Date.now()
    deadline = Math.min(deadline, now + QUIZ_SECONDS_PER_QUESTION * MS_PER_SECOND)
    secondsLeft = Math.max(0, Math.ceil((deadline - now) / MS_PER_SECOND))
    if (secondsLeft <= 0) {
      answer(null)
      return
    }
    if (secondsLeft <= WARNING_SECONDS && !warned) {
      warned = true
      status.textContent = `剩余 ${WARNING_SECONDS} 秒`
    }
    paintCountdown()
  }

  // paintCountdown 只更新倒计时文字和进度条。
  function paintCountdown() {
    if (!live) return
    live.text.textContent = `剩余 ${secondsLeft} 秒`
    live.fill.style.width = `${Math.round((secondsLeft / QUIZ_SECONDS_PER_QUESTION) * PERCENT)}%`
  }

  // answer 记录答案并揭晓；choice 为 null 表示超时。
  function answer(choice) {
    if (revealed) return
    if (choice !== null && performance.now() - shownAt < ANSWER_GUARD_MS) return
    answers[index] = choice
    revealed = true
    stopCountdown()
    draw('#quiz-next')
  }

  // next 进入下一题，或在最后一题后结算。
  function next() {
    // 双击时第二下会落在已经重绘掉的旧按钮上（引用还在），不拦住会多跳一题或重复写入成绩。
    if (phase !== 'question' || !revealed) return
    index++
    if (index >= quiz.length) finish()
    else beginQuestion()
  }

  // finish 计分并写入存档；保存失败时结果页要明说，成绩没有落盘。
  function finish() {
    result = scoreQuiz(quiz, answers)
    const r = ctx.commit((state) => { state.recognition.push(makeRecognitionRecord(ctx.today(), result)) })
    saveOk = r.ok
    resetAnnounce()
    phase = 'result'
    draw('#quiz-result')
  }

  // drawSetup 选择题数和历史成绩。
  function drawSetup() {
    const history = ctx.state.recognition.slice(-HISTORY_SIZE).reverse()
    const options = []
    for (let n = QUIZ_MIN; n <= QUIZ_MAX; n++) options.push(h('option', { value: String(n), selected: n === count }, `${n} 题`))
    root.append(
      h('div', { class: 'card stack' },
        h('p', { class: 'muted' }, `每题给你 ${QUIZ_SECONDS_PER_QUESTION} 秒，只判断“这是哪种模式”，不写代码。目标是看到题就条件反射。`),
        h('label', {}, '题数 ', h('select', { id: 'quiz-count', onchange: (e) => { count = Number(e.target.value) } }, options)),
        dataError ? h('p', { id: 'quiz-data-error', tabindex: '-1', class: 'error', role: 'alert' }, `题库数据有问题：${dataError}`) : null,
        h('button', { class: 'btn primary', onclick: start }, '开始')),
      h('h2', {}, '最近成绩'),
      history.length === 0
        ? h('p', { class: 'muted' }, '还没有记录。')
        : h('ul', {}, history.map((r) => h('li', {}, `${r.date}｜${r.correct} / ${r.total}`))))
  }

  // drawQuestion 渲染当前题；揭晓后标出正确和错误选项。
  function drawQuestion() {
    const q = quiz[index]
    const chosen = answers[index]
    const text = h('span', { class: 'muted' })
    const fill = h('div', { class: 'progress-fill' })
    live = { text, fill }

    const optionButtons = q.options.map((o) => {
      const cls = ['btn', 'option']
      if (revealed && o.id === q.answer) cls.push('correct')
      else if (revealed && o.id === chosen) cls.push('wrong')
      return h('button', { class: cls.join(' '), disabled: revealed, onclick: () => answer(o.id) }, o.name)
    })

    let verdict = null
    if (revealed) {
      const name = ctx.data.patternById[q.answer]?.name ?? q.answer
      const msg = chosen === null ? `时间到。正确答案：${name}` : chosen === q.answer ? `答对了：${name}` : `答错了。正确答案：${name}`
      // 判题结果写进 root 之外的常驻提示：临时插入的 role="status" 节点常常读不出来。下一题开始时会被“第 N 题”覆盖。
      status.textContent = msg
      verdict = h('div', { class: 'stack' },
        h('p', {}, msg),
        h('div', { class: 'row' },
          h('button', { id: 'quiz-next', class: 'btn primary', onclick: next }, index + 1 >= quiz.length ? '查看结果' : '下一题'),
          h('a', { class: 'btn', href: `#/templates?id=${q.answer}` }, '看模板卡')))
    }

    root.append(h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('strong', {}, `第 ${index + 1} / ${quiz.length} 题`), text),
      h('div', { class: 'progress' }, fill),
      h('h2', { style: 'margin:0' }, q.title),
      h('div', { class: 'row' }, h('span', { class: 'badge' }, LEVEL_LABELS[q.level])),
      h('p', { class: 'muted' }, q.summary),
      optionButtons,
      verdict))
    if (!revealed) paintCountdown()
    else { text.textContent = ''; fill.style.width = '0%' }
  }

  // drawResult 得分和错题列表。
  function drawResult() {
    const wrongItems = result.wrong.map((id) => {
      const q = quiz.find((x) => x.problemId === id)
      return h('li', {}, `${q.title}：${ctx.data.patternById[q.answer]?.name ?? q.answer}　`, h('a', { href: `#/templates?id=${q.answer}` }, '看模板卡'))
    })
    root.append(h('div', { class: 'card stack' },
      h('h2', { id: 'quiz-result', tabindex: '-1', style: 'margin:0' }, `${result.correct} / ${result.total}`),
      result.wrong.length === 0 ? h('p', {}, '全对。') : h('div', {}, h('h3', {}, '错题和正确模式'), h('ul', {}, wrongItems)),
      saveOk ? null : h('p', { class: 'error', role: 'alert' }, '保存失败，这轮成绩没有写入存档，见页面顶部提示。'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { phase = 'setup'; draw('#quiz-count') } }, '再来一轮'), h('a', { class: 'btn', href: '#/templates' }, '去看模板卡'))))
  }

  // draw 按当前阶段重绘；focusSel 是重绘后要获得焦点的元素（重绘会销毁刚按下的按钮，不补焦点键盘用户会掉回页面顶部）。
  function draw(focusSel = null) {
    clear(root)
    live = null
    if (phase === 'setup') drawSetup()
    else if (phase === 'question') drawQuestion()
    else drawResult()
    if (focusSel) root.querySelector(focusSel)?.focus({ preventScroll: true })
  }

  // onVisible 标签页切回前台时立即按截止时间刷新：后台页面的定时器会被浏览器降频，不补一次会看到旧倒计时。
  const onVisible = () => { if (!document.hidden) tick() }
  document.addEventListener('visibilitychange', onVisible)

  el.append(h('h1', {}, '识别训练'), status, root)
  draw()
  return () => { stopCountdown(); resetAnnounce(); document.removeEventListener('visibilitychange', onVisible) }
}
