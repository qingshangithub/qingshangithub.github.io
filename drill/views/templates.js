// 模板卡视图：触发信号、步骤、边界、核心题，以及“遮实现默写”。
import { h, clear } from './dom.js'

const RATINGS = [
  [1, '没写出来'],
  [2, '有出入'],
  [3, '完全默写'],
]
const RATING_LABELS = Object.fromEntries(RATINGS)
const RECITE_ROWS = 20
const DRAFT_KEY = 'drill.drafts'
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta']

// loadDrafts 读取本次会话里的默写草稿；读不到、格式不对时当作没有，非字符串的值丢弃。
function loadDrafts() {
  try {
    const v = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}')
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    return Object.fromEntries(Object.entries(v).filter(([, text]) => typeof text === 'string'))
  } catch {
    return {}
  }
}

// saveDrafts 写回草稿；隐私模式或配额已满时放弃，草稿只是便利功能，不影响进度存档。
function saveDrafts(d) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    // 写不进去就只保留在内存里
  }
}

// 放在模块级：切到别的视图再回来（比如点核心题再返回）草稿还在；sessionStorage 让刷新后也在。
const drafts = loadDrafts()

// indentOnTab 让默写区的 Tab 插入制表符。Shift+Tab 始终按默认移动焦点；Esc 之后的下一次 Tab 也移动焦点。
// 用 execCommand('insertText') 插入，浏览器会把它记进撤销栈，Ctrl+Z 能撤回；不支持时退回 setRangeText。
function indentOnTab(area) {
  let escaped = false
  area.addEventListener('keydown', (e) => {
    const plainTab = e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey
    if (e.key === 'Escape') {
      escaped = true
    } else if (plainTab && escaped) {
      escaped = false
    } else if (plainTab) {
      e.preventDefault()
      if (!document.execCommand('insertText', false, '\t')) {
        area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end')
        area.dispatchEvent(new Event('input', { bubbles: true }))
      }
    } else if (!MODIFIER_KEYS.includes(e.key)) {
      escaped = false
    }
  })
  area.addEventListener('blur', () => { escaped = false })
}

// sectionCards 渲染卡片的文字部分：触发信号、必查边界、核心步骤、核心题。
function sectionCards(card, cores) {
  return [
    h('div', { class: 'grid' },
      h('div', { class: 'card' }, h('h3', {}, '触发信号'), h('ul', {}, card.trigger.map((t) => h('li', {}, t)))),
      h('div', { class: 'card' }, h('h3', {}, '必查边界'), h('ul', {}, card.edges.map((t) => h('li', {}, t))))),
    h('div', { class: 'card' }, h('h3', {}, '核心步骤'), h('ol', {}, card.steps.map((t) => h('li', {}, t)))),
    h('div', { class: 'card' }, h('h3', {}, '核心题'), h('ul', {}, cores.map((p) => h('li', {}, h('a', { href: `#/problems?focus=${p.id}` }, p.title))))),
  ]
}

// comparePanes 渲染对照区：你的默写和参考实现并排（窄屏上下排列）。
function comparePanes(card, draft) {
  return h('div', { class: 'compare' },
    h('div', {}, h('h3', {}, '你的默写'), h('pre', {}, h('code', {}, draft || '（空）'))),
    h('div', {}, h('h3', {}, '参考实现'), h('pre', {}, h('code', {}, card.code))))
}

// mount 渲染模板卡页：模式导航、卡片内容与遮实现默写。
export function mount(ctx, params, el) {
  const ids = ctx.data.patterns.map((p) => p.id)
  let currentId = ids.includes(params.get('id')) ? params.get('id') : ids[0]
  let masked = true
  let revealed = false
  let rated = null // 本轮对照后刚点过的自评：{ rating, ok }

  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': '选择模式' })
  const chips = new Map()
  const bodyEl = h('div', { class: 'stack' })

  // reset 回到“遮住、未对照、未自评”。
  function reset() {
    revealed = false
    rated = null
  }

  // select 切换到另一张卡，并回到“遮住”状态。
  function select(id) {
    currentId = id
    reset()
    syncChips()
    draw()
  }

  // syncChips 只更新 aria-current，不重建按钮，键盘焦点留在被点的 chip 上。
  function syncChips() {
    for (const [id, btn] of chips) {
      if (id === currentId) btn.setAttribute('aria-current', 'true')
      else btn.removeAttribute('aria-current')
    }
  }

  // recitedLine 显示上次默写的日期和自评。
  function recitedLine(id) {
    const rec = ctx.state.templates[id]
    return h('p', { class: 'muted' }, rec ? `上次默写：${rec.lastRecitedAt}，${RATING_LABELS[rec.rating]}` : '还没有默写过。')
  }

  // rate 保存自评；保存失败时在页面上说明，不显示“已记录”。
  function rate(id, rating) {
    const r = ctx.commit((state) => { state.templates[id] = { lastRecitedAt: ctx.today(), rating } })
    rated = { rating, ok: r.ok }
    draw(`[data-rating="${rating}"]`)
  }

  // retry 清掉草稿和对照，重新默写这张卡。
  function retry(id) {
    delete drafts[id]
    saveDrafts(drafts)
    reset()
    draw('textarea')
  }

  // ratedNote 自评后的反馈和下一步。
  function ratedNote(card) {
    if (!rated) return null
    const msg = rated.ok
      ? h('p', { role: 'status' }, `已记录：${RATING_LABELS[rated.rating]}（${ctx.today()}）`)
      : h('p', { class: 'error', role: 'alert' }, '保存失败，自评没有写入存档，见页面顶部提示。')
    return h('div', { class: 'row' }, msg, h('button', { class: 'btn', onclick: () => retry(card.id) }, '再来一次'))
  }

  // reciteArea 渲染默写框：代码用的输入属性、Tab 缩进和操作提示。
  function reciteArea(card) {
    const area = h('textarea', {
      class: 'recite', rows: RECITE_ROWS, placeholder: '在这里默写函数体，不要看答案。',
      'aria-label': '默写区', 'aria-describedby': 'recite-hint',
      spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', wrap: 'off',
      oninput: (e) => { drafts[card.id] = e.target.value; saveDrafts(drafts) },
    })
    area.value = drafts[card.id] ?? ''
    indentOnTab(area)
    return h('div', {}, area,
      h('p', { id: 'recite-hint', class: 'muted hint' }, 'Tab 插入缩进。要离开输入框：Shift+Tab，或先按 Esc 再按 Tab。'))
  }

  // ratingRow 渲染三个自评按钮。
  function ratingRow(card) {
    return h('div', { class: 'row', role: 'group', 'aria-label': '自评' }, h('span', {}, '自评：'),
      RATINGS.map(([value, text]) => h('button', { class: 'btn', 'data-rating': String(value), onclick: () => rate(card.id, value) }, text)))
  }

  // codeArea 渲染代码区：查看模式直接给代码；默写模式先遮住，显示答案后对照并自评。
  function codeArea(card) {
    const toggle = h('label', { class: 'row' },
      h('input', { type: 'checkbox', checked: masked, onchange: (e) => { masked = e.target.checked; reset(); draw('input[type=checkbox]') } }),
      '遮实现默写（只看函数签名）')
    if (!masked) return h('div', { class: 'stack' }, toggle, h('pre', {}, h('code', {}, card.code)))
    if (!revealed) {
      return h('div', { class: 'stack' }, toggle,
        h('h3', {}, '函数签名'), h('pre', {}, h('code', {}, card.signatures.join('\n'))),
        reciteArea(card),
        h('button', { class: 'btn primary', onclick: () => { revealed = true; draw('#compare-title') } }, '显示答案'))
    }
    return h('div', { class: 'stack' }, toggle,
      h('h3', { id: 'compare-title', tabindex: '-1' }, '对照'),
      comparePanes(card, drafts[card.id]),
      ratingRow(card),
      ratedNote(card) ?? recitedLine(card.id))
  }

  // draw 重绘当前卡片；focusSel 指定重绘后要聚焦的元素，避免键盘焦点随旧节点丢失。
  function draw(focusSel) {
    const card = ctx.data.cards[currentId]
    clear(bodyEl)
    if (!card) {
      bodyEl.append(h('p', { class: 'error' }, `缺少模板卡数据：${currentId}`))
      return
    }
    const related = ctx.data.problems.filter((p) => p.pattern === currentId)
    // 对照时不显示顶部的“上次默写”行，该位置是 null；Element.append(null) 会把 "null" 渲染成文字，所以先过滤。
    const children = [
      h('div', { class: 'row' }, h('h2', { style: 'margin:0' }, card.name), h('span', { class: 'badge' }, `第 ${card.week} 周`), h('span', { class: 'muted' }, `共 ${related.length} 题`)),
      revealed ? null : recitedLine(currentId),
      ...sectionCards(card, related.filter((p) => p.core)),
      codeArea(card),
    ]
    bodyEl.append(...children.filter(Boolean))
    if (focusSel) bodyEl.querySelector(focusSel)?.focus()
  }

  for (const p of ctx.data.patterns) {
    const btn = h('button', { class: 'chip', onclick: () => select(p.id) }, p.name)
    chips.set(p.id, btn)
    chipsEl.append(btn)
  }
  syncChips()
  el.append(h('h1', {}, '模板卡'), h('p', { class: 'muted' }, '每个模式一张卡。先遮住实现默写，再对照参考实现，目标是 8 分钟内无提示写出可运行的代码。'), chipsEl, bodyEl)
  draw()
}
