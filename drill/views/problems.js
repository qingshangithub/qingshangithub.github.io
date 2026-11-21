// 题单视图：筛选、记录做完、重置。
import { h, clear } from './dom.js'
import { filterProblems, summarize, statusOf, problemLabel, LEVEL_LABELS, STATUS_LABELS } from '../core/filters.js'
import { recordFirstDone } from '../core/schedule.js'
import { noteForm } from './note-form.js'

// nextDue 返回最早的未完成复习到期日，没有则返回 null。
function nextDue(entry) {
  const due = entry.reviews.filter((r) => r.doneAt === null).map((r) => r.due).sort()
  return due[0] ?? null
}

// mount 渲染题单页：筛选、记录做完、重新记录与重置。
export function mount(ctx, params, el) {
  // URL 里的筛选参数可能是手写的，不是已知模式或状态时当作“全部”。
  const patternParam = params.get('pattern')
  const statusParam = params.get('status')
  const filter = {
    pattern: Object.hasOwn(ctx.data.patternById, patternParam) ? patternParam : 'all',
    level: 'all',
    status: Object.hasOwn(STATUS_LABELS, statusParam) ? statusParam : 'all',
  }
  const focusId = params.get('focus')
  let openId = focusId
  // focusRowId 记下重绘后要把键盘焦点还给哪一行，避免列表重建后焦点落到 body。
  let focusRowId = null

  const summaryEl = h('p', { class: 'muted', role: 'status' })
  const listEl = h('div', { class: 'card list' })

  // select 生成一个筛选下拉框。
  const select = (label, key, options) =>
    h('label', {}, `${label} `, h('select', {
      onchange: (e) => { filter[key] = e.target.value; openId = null; draw() },
    }, options.map(([value, text]) => h('option', { value, selected: String(filter[key]) === String(value) }, text))))

  const filters = h('div', { class: 'row filters' },
    select('模式', 'pattern', [['all', '全部'], ...ctx.data.patterns.map((p) => [p.id, p.name])]),
    select('难度', 'level', [['all', '全部'], ...Object.entries(LEVEL_LABELS)]),
    select('状态', 'status', [['all', '全部'], ...Object.entries(STATUS_LABELS)]))

  // noteLine 显示已记录的复盘和下次复习日期。
  function noteLine(entry) {
    const due = nextDue(entry)
    return h('p', { class: 'muted' }, `做完于 ${entry.firstDoneAt}｜模式：${entry.note.pattern}｜卡点：${entry.note.stuck}｜边界：${entry.note.edge}`, due ? `｜下次复习：${due}` : '｜复习已全部完成')
  }

  // submit 保存“做完”记录并生成复习计划；题目已有记录时先确认，避免误清空原有复习进度。
  function submit(p, note, smooth) {
    const existing = ctx.state.problems[p.id]
    if (existing) {
      const done = existing.reviews.filter((r) => r.doneAt !== null).length
      if (!window.confirm(`“${p.title}”已有记录。重新记录会清空它原来的复盘、复习计划和当前状态（已完成 ${done} 轮复习），确定覆盖吗？`)) return
    }
    ctx.commit((state) => { state.problems[p.id] = recordFirstDone({ smooth, core: p.core, date: ctx.today(), note }) })
    openId = null
    focusRowId = p.id
    draw()
  }

  // reset 把题目重置为未做，同时删除它的复习计划。
  function reset(p) {
    if (!window.confirm(`把“${p.title}”重置为未做？它的复盘和复习计划都会删除。`)) return
    ctx.commit((state) => { delete state.problems[p.id] })
    openId = null
    focusRowId = p.id
    draw()
  }

  // row 渲染一道题：状态点、标题与摘要、模式/难度/周次、操作按钮；复盘和表单在下方整行展开。
  function row(p) {
    const st = statusOf(ctx.state, p.id)
    const entry = ctx.state.problems[p.id]
    return h('div', { class: `problem${p.id === focusId ? ' focus' : ''}`, id: `p-${p.id}`, tabindex: '-1' },
      h('div', { class: 'problem-head' },
        h('span', { class: `dot ${st}`, 'aria-hidden': 'true' }),
        h('div', {},
          h('div', { class: 'row' },
            h('span', { class: 'problem-title' }, problemLabel(p)),
            h('span', { class: `badge ${st}` }, STATUS_LABELS[st]),
            p.core && h('span', { class: 'badge core' }, '核心')),
          h('p', { class: 'problem-sub' }, p.summary)),
        h('div', { class: 'problem-meta' },
          h('a', { class: 'badge', href: `#/templates?id=${p.pattern}` }, ctx.data.patternById[p.pattern]?.name ?? p.pattern),
          h('span', { class: `lv lv-${p.level}` }, LEVEL_LABELS[p.level]),
          h('span', {}, `计划第 ${p.week} 周`)),
        h('div', { class: 'problem-acts' },
          h('a', { class: 'btn', href: p.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `去力扣做题：${p.title}` }, '去力扣做题'),
          h('button', { class: `btn${entry ? '' : ' primary'}`, 'aria-label': `${entry ? '重新记录' : '记录做完'}：${p.title}`, onclick: () => { openId = openId === p.id ? null : p.id; focusRowId = p.id; draw() } }, entry ? '重新记录' : '记录做完'),
          entry && h('button', { class: 'btn danger', 'aria-label': `重置为未做：${p.title}`, onclick: () => reset(p) }, '重置为未做'))),
      (entry || openId === p.id) && h('div', { class: 'problem-extra' },
        entry && noteLine(entry),
        openId === p.id && noteForm({ submitLabel: entry ? '覆盖并重新生成复习计划' : '保存并生成复习计划', onSubmit: (note, smooth) => submit(p, note, smooth), onCancel: () => { openId = null; focusRowId = p.id; draw() } })))
  }

  // draw 按当前筛选重绘统计和列表。
  function draw() {
    const stat = summarize(ctx.data.problems, ctx.state)
    const items = filterProblems(ctx.data.problems, ctx.state, filter)
    summaryEl.textContent = `显示 ${items.length} / ${stat.total} 题｜已掌握 ${stat.mastered}｜卡过 ${stat.stuck}｜未做 ${stat.todo}`
    clear(listEl)
    if (items.length === 0) listEl.append(h('p', { class: 'muted' }, '没有符合条件的题。'))
    for (const p of items) listEl.append(row(p))
    if (focusRowId) {
      document.getElementById(`p-${focusRowId}`)?.focus({ preventScroll: true })
      focusRowId = null
    }
  }

  el.append(h('h1', {}, '题单'), h('p', { class: 'subtitle' }, '按学习顺序排列：先按模式（由易到难），同一模式内先简单后困难，同难度核心题在前。题目来自 CodeTop 热度前 100。'), filters, summaryEl, listEl)
  draw()
  // 路由在 mount 返回后还会把页面滚回顶部，所以等下一帧再滚到目标行。
  if (focusId) requestAnimationFrame(() => document.getElementById(`p-${focusId}`)?.scrollIntoView({ block: 'center' }))
}
