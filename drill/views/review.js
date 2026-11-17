// 复习视图：今日到期的复习、自评通过与否、未来 7 天预览。
import { h, clear } from './dom.js'
import { dueReviews, upcomingReviews, completeReview, MAX_REVIEWS_PER_DAY } from '../core/schedule.js'
import { daysBetween } from '../core/dates.js'

const UPCOMING_DAYS = 7

// mount 渲染复习页：今日到期的复习、通过/没通过、未来 7 天预览。
export function mount(ctx, params, el) {
  // 常驻提示放在会被重绘的列表之外，读屏软件才会播报；可聚焦，作答后把焦点放到这里。
  const msgEl = h('div', { id: 'review-msg', class: 'muted', role: 'status', tabindex: '-1', style: 'margin-bottom: 10px; padding: 0 4px' })
  const dueEl = h('div', { class: 'stack' })
  const upcomingEl = h('div', {})
  const statsEl = h('p', { class: 'muted' })

  // titleOf 返回题目标题；存档里有但题单里没有的题显示为“未知题目”。
  const titleOf = (id) => ctx.data.byId[id]?.title ?? `未知题目（${id}）`
  // showMsg 显示普通提示。
  const showMsg = (text) => { msgEl.replaceChildren(text) }
  // showError 显示错误提示（role="alert" 会立即播报）。
  const showError = (text) => { msgEl.replaceChildren(h('p', { class: 'error', role: 'alert' }, text)) }

  // nextPending 返回题目下一个未完成轮的到期日，没有则返回 null。
  const nextPending = (entry) => entry.reviews.filter((r) => r.doneAt === null).map((r) => r.due).sort()[0] ?? null

  // isStillDue 判断这条复习是否仍是该题最早的未完成轮且到期日没变：双击或重复触发旧按钮时，这一轮可能已经完成或顺延。
  function isStillDue(item) {
    const entry = ctx.state.problems[item.id]
    if (!entry) return false
    const first = entry.reviews.filter((r) => r.doneAt === null).sort((a, b) => a.round - b.round)[0]
    return first !== undefined && first.round === item.round && first.due === item.due
  }

  // onResult 记录一轮复习的结果并提示下一步。
  function onResult(item, passed) {
    const synced = ctx.sync()
    if (!isStillDue(item)) {
      // 同一标签页里的重复触发保持静默（上一次的结果提示还在）；存档是被别的标签页改过的，要告诉用户并刷新列表。
      if (synced) { showMsg('这道题的复习状态已在别处更新，列表已刷新。'); draw('#review-msg') }
      return
    }
    const title = titleOf(item.id)
    let r
    try {
      r = ctx.commit((state) => { state.problems[item.id] = completeReview(state.problems[item.id], item.round, passed, ctx.today()) })
    } catch (e) {
      showError(`记录失败：${e.message}`)
      draw('#review-msg')
      return
    }
    if (!r.ok) {
      showError('保存失败，这次复习结果没有写入存档，见页面顶部提示。')
    } else {
      const next = nextPending(ctx.state.problems[item.id])
      if (passed) showMsg(next ? `“${title}”通过。下一轮在 ${next}。` : `“${title}”通过，复习全部完成，已掌握。`)
      else showMsg(`“${title}”没通过，已标记为卡过，明天再来一次。`)
    }
    draw('#review-msg')
  }

  // dueCard 渲染一道到期的复习；题单里没有的题只保留自评按钮，不给力扣和模板卡链接。
  function dueCard(item) {
    const p = ctx.data.byId[item.id]
    const entry = ctx.state.problems[item.id]
    const title = titleOf(item.id)
    const tag = `${title}（第 ${item.round} 轮）`
    const late = daysBetween(item.due, ctx.today())
    return h('div', { class: 'card stack review-item' },
      h('div', { class: 'row' },
        h('strong', { role: 'heading', 'aria-level': '2' }, title),
        h('span', { class: 'badge' }, `第 ${item.round} 轮`),
        p?.core && h('span', { class: 'badge core' }, '核心'),
        p && h('a', { class: 'badge', href: `#/templates?id=${p.pattern}` }, ctx.data.patternById[p.pattern]?.name ?? p.pattern),
        h('span', { class: 'muted' }, late > 0 ? `逾期 ${late} 天` : '今天到期')),
      h('p', { class: 'muted' }, `上次复盘：模式 ${entry.note.pattern}｜卡点 ${entry.note.stuck}｜边界 ${entry.note.edge}`),
      h('p', {}, '规则：不看题解和模板，从空白重写；15 分钟内写出可运行、并通过边界检查的代码才算通过。'),
      h('div', { class: 'row' },
        p && h('a', { class: 'btn', href: p.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `打开力扣题面：${tag}` }, '打开力扣题面'),
        p && h('a', { class: 'btn', href: `#/templates?id=${p.pattern}`, 'aria-label': `看模板卡：${tag}` }, '看模板卡'),
        h('button', { class: 'btn primary', 'aria-label': `通过：${tag}`, onclick: () => onResult(item, true) }, '通过'),
        h('button', { class: 'btn danger', 'aria-label': `没通过：${tag}`, onclick: () => onResult(item, false) }, '没通过')))
  }

  // draw 重绘今日列表、预览和统计；focusSel 是重绘后要获得焦点的元素（重绘会销毁刚按下的按钮，不补焦点键盘用户会掉回页面顶部）。
  function draw(focusSel = null) {
    const today = ctx.today()
    const { items, total } = dueReviews(ctx.state, today)
    clear(dueEl)
    if (items.length === 0) dueEl.append(h('p', { class: 'muted' }, '今天没有到期的复习。'))
    for (const item of items) dueEl.append(dueCard(item))
    if (total > items.length) dueEl.append(h('p', { class: 'muted' }, `每天最多排 ${MAX_REVIEWS_PER_DAY} 道，还有 ${total - items.length} 道顺延。`))

    const upcoming = upcomingReviews(ctx.state, today, UPCOMING_DAYS)
    clear(upcomingEl)
    upcomingEl.append(upcoming.length === 0
      ? h('p', { class: 'muted' }, `未来 ${UPCOMING_DAYS} 天没有复习。`)
      : h('ul', {}, upcoming.map((u) => h('li', {}, h('span', { class: 'nowrap' }, u.due), `｜${titleOf(u.id)}｜第 ${u.round} 轮`))))

    const entries = Object.values(ctx.state.problems)
    const passed = entries.flatMap((e) => e.reviews).filter((r) => r.passed === true).length
    const mastered = entries.filter((e) => e.status === 'mastered' && e.reviews.every((r) => r.doneAt !== null)).length
    statsEl.textContent = `累计通过复习 ${passed} 次；复习全部完成的题 ${mastered} 道。`
    if (focusSel) el.querySelector(focusSel)?.focus({ preventScroll: true })
  }

  el.append(h('h1', {}, '复习'), msgEl, dueEl, h('h2', {}, `未来 ${UPCOMING_DAYS} 天`), upcomingEl, statsEl)
  draw()
}
