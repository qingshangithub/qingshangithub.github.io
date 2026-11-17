// 快闪视图：15 分钟分段计时，结束后复盘并写入存档。
import { h, clear } from './dom.js'
import { createTimer, SEGMENTS, TOTAL_SECONDS, makeFlashRecord } from '../core/timer.js'
import { compareStudyOrder, statusOf, STATUS_LABELS } from '../core/filters.js'
import { recordFirstDone, suggestNew } from '../core/schedule.js'
import { noteForm } from './note-form.js'

const TICK_MS = 250
const HISTORY_SIZE = 5
const SECONDS_PER_MINUTE = 60
const MS_PER_SECOND = 1000
const PERCENT = 100
// 开始后 3 秒内不能点“完成”：双击“开始”时第二下会落在同一位置的“完成”上，把刚开始的计时直接结束。
const MIN_FINISH_SECONDS = 3
// 进行中的计时存在 sessionStorage（不进 drill.v1 存档），刷新页面或切到别的页面再回来可以接着计。
const RUN_KEY = 'drill.flashRun'
const WARNING_TEXT = { 'final-minute': '最后 1 分钟', 'final-10': '最后 10 秒' }

// fmt 把秒数格式化成 mm:ss。
function fmt(sec) {
  return `${String(Math.floor(sec / SECONDS_PER_MINUTE)).padStart(2, '0')}:${String(sec % SECONDS_PER_MINUTE).padStart(2, '0')}`
}

// readRun 读出 sessionStorage 里保存的计时；没有、损坏、字段不对或题目已不存在时返回 null。
function readRun(byId) {
  let run = null
  try { run = JSON.parse(sessionStorage.getItem(RUN_KEY)) } catch { return null }
  if (!run || typeof run !== 'object') return null
  const { problemId, running, elapsedMs, savedAt } = run
  if (typeof problemId !== 'string' || !Object.hasOwn(byId, problemId)) return null
  if (typeof running !== 'boolean' || !Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(savedAt)) return null
  return run
}

// clearRun 清掉保存的计时；sessionStorage 不可用（隐私模式）时只是不能恢复。
function clearRun() {
  try { sessionStorage.removeItem(RUN_KEY) } catch { /* 忽略 */ }
}

// initialProblem 默认选题：URL 指定的题，其次是卡过的题（模式已经认识），再次是今日建议新题，最后是第一题。
function initialProblem(ctx, wanted) {
  if (wanted && ctx.data.byId[wanted]) return wanted
  const stuck = ctx.data.problems.find((p) => statusOf(ctx.state, p.id) === 'stuck')
  if (stuck) return stuck.id
  const suggested = suggestNew(ctx.data.problems, ctx.state, ctx.today())[0]
  return (suggested ?? ctx.data.problems[0]).id
}

// mount 挂载快闪视图，返回清理函数。
export function mount(ctx, params, el) {
  let clockAt = null // 恢复计时时临时指定“现在”，其余时间为 null，走真实时钟
  const timer = createTimer(() => clockAt ?? Date.now())
  let phase = 'idle' // idle | running | review | saved
  let selectedId = initialProblem(ctx, params.get('problem'))
  let result = null
  let saveOk = true
  let tickId = null
  let live = null
  let announcedKey = null

  const root = h('div', { class: 'stack' })
  // status 放在会被重绘的 root 之外，读屏软件才会把文字变化当作播报；只在分段切换和最后 1 分钟、最后 10 秒时更新。
  const status = h('p', { class: 'sr-only', role: 'status' })
  const problem = () => ctx.data.byId[selectedId]

  // startTick / stopTick 管理刷新定时器。
  const startTick = () => { if (tickId === null) tickId = setInterval(tick, TICK_MS) }
  const stopTick = () => { if (tickId !== null) { clearInterval(tickId); tickId = null } }

  // tick 刷新倒计时；时间到时自动结束。
  function tick() {
    if (phase !== 'running') return
    const s = timer.snapshot()
    if (s.finished) finish(false)
    else paint(s)
  }

  // announce 在分段或警告状态变化时更新读屏提示，其余时间不动，避免每秒打断。
  function announce(s) {
    const key = s.warning === 'none' ? s.segment : s.warning
    if (key === announcedKey) return
    announcedKey = key
    status.textContent = WARNING_TEXT[s.warning] ?? `${s.segmentLabel}阶段，共 ${SEGMENTS[s.segmentIndex].seconds / SECONDS_PER_MINUTE} 分钟`
  }

  // resetAnnounce 离开计时界面时清掉读屏提示。
  function resetAnnounce() {
    announcedKey = null
    status.textContent = ''
  }

  // saveRun 把进行中的计时写进 sessionStorage，开始、暂停、继续时调用。
  function saveRun() {
    const s = timer.snapshot()
    const run = { problemId: selectedId, running: s.running, elapsedMs: s.elapsed * MS_PER_SECOND, savedAt: Date.now() }
    try { sessionStorage.setItem(RUN_KEY, JSON.stringify(run)) } catch { /* 不能恢复而已，计时本身不受影响 */ }
  }

  // restoreRun 恢复上一次没结束的计时：计时中的要补上离开期间过去的时间，暂停的保持原样。
  // 已经超过 15 分钟的直接进入复盘；保存的内容无效时清掉并保持空闲。
  function restoreRun() {
    const run = readRun(ctx.data.byId)
    if (!run) { clearRun(); return }
    const now = Date.now()
    const elapsedMs = run.elapsedMs + (run.running ? Math.max(0, now - run.savedAt) : 0)
    selectedId = run.problemId
    if (elapsedMs >= TOTAL_SECONDS * MS_PER_SECOND) {
      clearRun()
      result = { elapsed: TOTAL_SECONDS, completed: false }
      phase = 'review'
      return
    }
    clockAt = now - elapsedMs
    timer.start()
    clockAt = now
    if (!run.running) timer.pause()
    clockAt = null
    phase = 'running'
  }

  // backToIdle 回到选题界面，丢弃计时和保存的进度（放弃、取消复盘、再来一道共用）。
  function backToIdle() {
    stopTick()
    timer.reset()
    clearRun()
    resetAnnounce()
    phase = 'idle'
    draw('#flash-picker')
  }

  // paint 只更新会变的节点（时钟、分段进度、提示），不重建 DOM。
  function paint(s) {
    announce(s)
    live.clock.textContent = fmt(s.remaining)
    live.finishBtn.disabled = s.elapsed < MIN_FINISH_SECONDS
    live.panel.classList.toggle('warn-minute', s.warning === 'final-minute')
    live.panel.classList.toggle('warn-final', s.warning === 'final-10')
    live.notice.hidden = !s.noKeyboard
    live.segments.forEach((seg, i) => {
      const ratio = i < s.segmentIndex || s.finished ? 1 : i === s.segmentIndex ? s.segmentElapsed / SEGMENTS[i].seconds : 0
      seg.fill.style.width = `${Math.round(ratio * PERCENT)}%`
      seg.box.classList.toggle('current', i === s.segmentIndex && !s.finished)
    })
  }

  // finish 结束计时并进入复盘。completed 表示用户点了“完成”；先取快照，时间已经用完（还没等到下一次 tick）时不算按时完成。
  function finish(completed) {
    const snap = timer.snapshot()
    result = { elapsed: snap.elapsed, completed: completed && !snap.finished }
    timer.pause()
    stopTick()
    clearRun()
    resetAnnounce()
    phase = 'review'
    draw()
  }

  // save 写入快闪记录；这道题还没有做完记录时生成复习计划，已有记录时只更新复盘。
  function save(note, smooth) {
    const p = problem()
    const date = ctx.today()
    clearRun()
    const r = ctx.commit((state) => {
      state.flash.push(makeFlashRecord({ date, problemId: p.id, elapsedSeconds: result.elapsed, completed: result.completed }))
      const prev = state.problems[p.id]
      if (!prev) {
        state.problems[p.id] = recordFirstDone({ smooth, core: p.core, date, note })
      } else {
        prev.note = note
        if (!smooth) {
          prev.status = 'stuck'
          // 复习轮已经全部做完的题被标成卡过时要重新排第 2、3、4 轮，否则它没有待复习的轮次，永远不会进复习队列。
          if (prev.reviews.every((rv) => rv.doneAt !== null)) prev.reviews = recordFirstDone({ smooth: false, core: p.core, date, note }).reviews
        }
      }
    })
    saveOk = r.ok
    phase = 'saved'
    draw('#flash-saved')
  }

  // problemPicker 选题下拉框；计时中不显示，所以不需要禁用状态。
  function problemPicker() {
    const sorted = [...ctx.data.problems].sort(compareStudyOrder)
    return h('label', {}, '题目 ', h('select', {
      id: 'flash-picker',
      onchange: (e) => { selectedId = e.target.value; draw('#flash-picker') },
    }, sorted.map((p) => h('option', { value: p.id, selected: p.id === selectedId }, `[${STATUS_LABELS[statusOf(ctx.state, p.id)]}] ${p.title}`))))
  }

  // drawIdle 开始前：选题和规则说明。
  function drawIdle() {
    root.append(
      h('div', { class: 'card stack' },
        problemPicker(),
        h('div', { class: 'row' }, h('a', { class: 'btn', href: problem().url, target: '_blank', rel: 'noopener noreferrer' }, '打开力扣题面'), h('span', { class: 'muted' }, problem().summary)),
        h('p', { class: 'muted' }, '选一道模式已经认识的题。读题 2 分钟、设计 2 分钟、编码 8 分钟、验证 3 分钟；前 5 分钟不碰键盘，先写出模式、数据结构、步骤和边界；编码时出声叙述；最后用小例子手动走一遍。'),
        h('button', { class: 'btn primary', onclick: () => { timer.start(); phase = 'running'; saveRun(); draw('#flash-pause'); startTick() } }, '开始 15 分钟计时')))
  }

  // drawRunning 计时中：时钟、四段进度、提示和控制按钮。
  function drawRunning() {
    const segments = SEGMENTS.map((seg) => {
      const fill = h('div', { class: 'progress-fill' })
      return { fill, box: h('div', { class: 'segment' }, seg.label, h('span', { class: 'segment-min' }, ` ${seg.seconds / SECONDS_PER_MINUTE} 分钟`), h('div', { class: 'progress' }, fill)) }
    })
    const clock = h('div', { class: 'clock', role: 'timer', 'aria-live': 'off', 'aria-label': '剩余时间' })
    const finishBtn = h('button', { class: 'btn primary', onclick: () => finish(true) }, '完成')
    const notice = h('div', { class: 'notice' }, '前 5 分钟不许碰键盘：先在纸上或注释里写出模式名称、核心数据结构、关键步骤和边界条件。')
    const snap = timer.snapshot()
    const panel = h('div', { class: 'card stack flash' },
      h('div', { class: 'row between' }, h('strong', {}, problem().title), h('a', { href: problem().url, target: '_blank', rel: 'noopener noreferrer' }, '打开力扣题面')),
      clock,
      h('div', { class: 'segments' }, segments.map((s) => s.box)),
      notice,
      h('div', { class: 'row' },
        h('button', { id: 'flash-pause', class: 'btn', onclick: () => { if (snap.running) timer.pause(); else timer.resume(); saveRun(); draw('#flash-pause') } }, snap.running ? '暂停' : '继续'),
        finishBtn,
        h('button', { class: 'btn danger', onclick: backToIdle }, '放弃')))
    live = { panel, clock, notice, segments, finishBtn }
    root.append(panel)
    paint(snap)
  }

  // drawReview 结束后：用时和三行复盘表单。
  function drawReview() {
    root.append(
      h('div', { class: 'card stack' },
        h('p', {}, `${problem().title}：用时 ${fmt(result.elapsed)}，${result.completed ? '在时限内点了完成。' : '时间到，没有点完成。'}`),
        noteForm({ submitLabel: '保存复盘', onSubmit: save, onCancel: backToIdle })))
  }

  // drawSaved 保存后：确认信息和最近记录。
  function drawSaved() {
    const recent = ctx.state.flash.slice(-HISTORY_SIZE).reverse()
    root.append(
      h('div', { class: 'card stack' },
        saveOk
          ? h('p', { id: 'flash-saved', tabindex: '-1', role: 'status' }, '已保存。这道题的复习计划见“复习”页。')
          : h('p', { id: 'flash-saved', tabindex: '-1', class: 'error', role: 'alert' }, '保存失败，复盘和快闪记录没有写入存档，见页面顶部提示。'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: backToIdle }, '再来一道'), h('a', { class: 'btn', href: '#/review' }, '去复习'))),
      h('h2', {}, '最近的快闪'),
      h('ul', {}, recent.map((r) => h('li', {}, `${r.date}｜${ctx.data.byId[r.problemId]?.title ?? r.problemId}｜用时 ${fmt(r.seconds)}｜${r.finished ? '按时完成' : '未完成'}`))))
  }

  // draw 按当前阶段重绘；focusSel 是重绘后要获得焦点的元素（重绘会销毁刚按下的按钮，不补焦点键盘用户会掉回页面顶部）。
  function draw(focusSel = null) {
    clear(root)
    if (phase === 'idle') drawIdle()
    else if (phase === 'running') drawRunning()
    else if (phase === 'review') drawReview()
    else drawSaved()
    if (focusSel) root.querySelector(focusSel)?.focus({ preventScroll: true })
  }

  // onVisible 标签页切回前台时立即刷新：后台页面的定时器会被浏览器降频，不补一次会看到旧时间。
  const onVisible = () => { if (!document.hidden) tick() }
  document.addEventListener('visibilitychange', onVisible)

  el.append(h('h1', {}, '快闪'), status, root)
  restoreRun()
  draw()
  if (phase === 'running') startTick()
  return () => { stopTick(); resetAnnounce(); document.removeEventListener('visibilitychange', onVisible) }
}
