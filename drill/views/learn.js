// 讲解视图：一课的页头、目标清单、分节正文（术语表、提示块、着色代码）、热身题、外链，以及“我学完了 / 我已经会了，跳过”。
// 宽屏时右侧有随滚动高亮的目录，顶部有阅读进度条。
import { h } from './dom.js'
import { tokenizeInline } from '../core/inline.js'
import { tokenizeGo } from '../core/highlight.js'
import { problemLabel } from '../core/filters.js'

const TERM_ITEM = /^(?:`([^`]+)`|\*\*([^*]+)\*\*)：([\s\S]+)$/
const PITFALL_MARK = '坑'
const SPY_OFFSET = 120 // 标题滚到离视口顶部这么近时，目录高亮它

// inline 把一段带 `代码` 和 **加粗** 的文字渲染成节点，文字都走文本节点。
function inline(text) {
  return tokenizeInline(text).map((tok) => (tok.t === 'code' ? h('code', {}, tok.text) : tok.t === 'strong' ? h('strong', {}, tok.text) : tok.text))
}

// plain 去掉行内标记，用在目录里。
function plain(text) {
  return text.replace(/[`*]/g, '')
}

// termList 一组“术语：说明”形式的列表渲染成术语表；有任何一项不是这个形式就返回 null。
function termList(items) {
  const rows = items.map((x) => TERM_ITEM.exec(x))
  if (items.length < 2 || rows.some((m) => !m)) return null
  return h('ul', { class: 'terms' }, rows.map(([, code, strong, desc]) =>
    h('li', {}, code ? h('code', { class: 'term' }, code) : h('strong', { class: 'term' }, strong), h('span', { class: 'desc' }, inline(desc)))))
}

// codeWindow 示例代码：带文件名的深色窗口，Go 代码按词类着色。
function codeWindow(b) {
  const parts = tokenizeGo(b.code).map((t) => (t.t === 'plain' ? t.text : h('span', { class: `tk-${t.t}` }, t.text)))
  return h('figure', { class: 'code-win' },
    h('figcaption', {}, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', { class: 'fname' }, b.file)),
    h('pre', { tabindex: '0', 'aria-label': `示例代码：${b.file}` }, h('code', {}, parts)))
}

// block 渲染正文里的一块（标题除外，标题由 section 处理）。
function block(b) {
  if (b.t === 'p') return h('p', {}, inline(b.text))
  if (b.t === 'ul') return termList(b.items) ?? h('ul', {}, b.items.map((x) => h('li', {}, inline(x))))
  return codeWindow(b)
}

// groupSections 按小标题把正文分节；第一个小标题之前的内容归入没有标题的一节。
function groupSections(blocks) {
  const out = []
  let cur = { heading: null, blocks: [] }
  for (const b of blocks) {
    if (b.t === 'h') {
      if (cur.heading !== null || cur.blocks.length > 0) out.push(cur)
      cur = { heading: b.text, blocks: [] }
    } else cur.blocks.push(b)
  }
  if (cur.heading !== null || cur.blocks.length > 0) out.push(cur)
  return out
}

// sectionEl 渲染一节；标题含“坑”的节做成提示块。
function sectionEl(sec) {
  const warn = sec.heading?.includes(PITFALL_MARK)
  const heading = sec.heading === null ? null : h('h2', {}, warn && h('span', { class: 'warn-mark', 'aria-hidden': 'true' }, '!'), inline(sec.heading))
  return { el: h('section', { class: warn ? 'sec warn' : 'sec' }, heading, sec.blocks.map(block)), heading, text: sec.heading }
}

// notFound 课 id 不存在时的提示。
function notFound(el) {
  el.append(h('h1', {}, '没有找到这一课'), h('p', { class: 'muted' }, '链接里的课 id 不对，或者这一课还没有写。'), h('a', { class: 'btn', href: '#/roadmap' }, '回到路线'))
}

// tocNav 右侧目录：每个小标题一个按钮，点击平滑滚到对应小节。
function tocNav(headings) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const buttons = headings.map(({ text, el }) => h('button', { type: 'button', class: 'toc-item', onclick: () => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }) }, plain(text)))
  return { nav: h('nav', { class: 'toc', 'aria-label': '本课目录' }, h('p', { class: 'toc-title' }, '本课内容'), buttons), buttons }
}

// track 绑定滚动：更新阅读进度条和目录高亮，返回清理函数。
function track(bar, headings, buttons) {
  let frame = 0
  const update = () => {
    frame = 0
    const max = document.documentElement.scrollHeight - window.innerHeight
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0})`
    let at = -1
    headings.forEach(({ el }, i) => { if (el.getBoundingClientRect().top <= SPY_OFFSET) at = i })
    buttons.forEach((btn, i) => {
      btn.classList.toggle('on', i === at)
      if (i === at) btn.setAttribute('aria-current', 'location')
      else btn.removeAttribute('aria-current')
    })
  }
  const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  update()
  return () => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    cancelAnimationFrame(frame)
    bar.remove()
  }
}

// mount 渲染一课。
export function mount(ctx, params, el) {
  const lesson = ctx.data.lessonById[params.get('id')]
  if (!lesson) return void notFound(el)
  const pattern = lesson.patternId ? ctx.data.patternById[lesson.patternId] : null
  const record = Object.hasOwn(ctx.state.lessons, lesson.id) ? ctx.state.lessons[lesson.id] : null
  const msg = h('p', { class: 'error', role: 'alert', id: 'learn-msg' })

  // mark 记下“学完”或“跳过”，成功后回到今天页。
  function mark(skipped) {
    const r = ctx.commit((s) => { s.lessons[lesson.id] = { doneAt: ctx.today(), skipped } })
    if (!r.ok) return void (msg.textContent = '保存失败，这一课的状态没有写入存档，见页面顶部提示。')
    ctx.navigate('today')
  }
  // unmark 把这一课改回“没学”。
  function unmark() {
    ctx.commit((s) => { delete s.lessons[lesson.id] })
    ctx.rerender()
  }

  const warmups = lesson.warmups.map((id) => ctx.data.byId[id]).filter(Boolean)
  const secs = groupSections(lesson.blocks).map(sectionEl)
  const headings = secs.filter((s) => s.heading).map((s) => ({ text: s.text, el: s.heading }))
  const where = pattern ? `模式讲解 · ${pattern.name}` : '基础课'
  const status = record ? h('span', { class: `chip-meta ${record.skipped ? '' : 'ok'}` }, record.skipped ? `${record.doneAt} 标记为已经会了` : `${record.doneAt} 学完`) : null

  // 可能为 null 或 false 的段落先过滤：Element.append(null) 会把字面量 "null" 渲染到页面上。
  const article = [
    h('a', { class: 'muted back-link', href: '#/roadmap' }, '← 路线'),
    h('p', { class: 'eyebrow' }, where),
    h('h1', { class: 'lesson-title' }, lesson.title),
    h('div', { class: 'meta-row' }, h('span', { class: 'chip-meta' }, `约 ${lesson.minutes} 分钟`), h('span', { class: 'chip-meta' }, `${headings.length} 个小节`), status),
    h('section', { class: 'card can-card' }, h('h3', {}, '学完要能做到'), h('ul', { class: 'checks' }, lesson.can.map((x) => h('li', {}, x)))),
    h('div', { class: 'lesson' }, secs.map((s) => s.el)),
    warmups.length > 0 && h('section', { class: 'extra' }, h('h2', {}, '热身题'), h('p', { class: 'muted' }, '做不出来就看题解，再关掉从空白重写一遍。'),
      h('ul', { class: 'rows card' }, warmups.map((p) => h('li', {}, h('a', { href: `#/problems?focus=${p.id}` }, problemLabel(p)))))),
    lesson.links.length > 0 && h('section', { class: 'extra' }, h('h2', {}, '想深入看'),
      h('ul', { class: 'rows card' }, lesson.links.map((l) => h('li', {}, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label, h('span', { class: 'ext', 'aria-hidden': 'true' }, '↗')))))),
    h('section', { class: 'card finish' },
      h('div', {}, h('h3', {}, record ? '这一课已经记下了' : '读完了？'), h('p', { class: 'muted' }, record ? '想重新学一遍，可以改回“没学”。' : '记下之后回到今天页，继续下一项。')),
      h('div', { class: 'row' },
        !record && h('button', { class: 'btn primary big', onclick: () => mark(false) }, '我学完了'),
        !record && h('button', { class: 'btn', onclick: () => mark(true) }, '我已经会了，跳过'),
        record && h('a', { class: 'btn primary', href: '#/today' }, '回到今天'),
        record && h('button', { class: 'btn', onclick: unmark }, '改回“没学”'))),
    msg]

  const toc = headings.length >= 2 ? tocNav(headings) : null
  const bar = h('div', { class: 'read-progress', 'aria-hidden': 'true' })
  document.body.append(bar)
  el.append(h('div', { class: 'lesson-page' }, h('article', { class: 'lesson-article' }, article.filter(Boolean)), toc && h('aside', { class: 'lesson-aside' }, toc.nav)))
  return track(bar, headings, toc ? toc.buttons : [])
}
