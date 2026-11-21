// 讲解视图：一课的正文、示例、热身题和外部链接，以及“我学完了 / 我已经会了，跳过”。
import { h } from './dom.js'
import { tokenizeInline } from '../core/inline.js'
import { problemLabel } from '../core/filters.js'

// inline 把一段带 `代码` 和 **加粗** 的文字渲染成节点，文字都走文本节点。
function inline(text) {
  return tokenizeInline(text).map((tok) => (tok.t === 'code' ? h('code', {}, tok.text) : tok.t === 'strong' ? h('strong', {}, tok.text) : tok.text))
}

// block 渲染正文里的一块。
function block(b) {
  if (b.t === 'h') return h('h2', {}, inline(b.text))
  if (b.t === 'p') return h('p', {}, inline(b.text))
  if (b.t === 'ul') return h('ul', {}, b.items.map((x) => h('li', {}, inline(x))))
  return h('pre', { 'aria-label': `示例代码：${b.file}` }, h('code', {}, b.code))
}

// notFound 课 id 不存在时的提示。
function notFound(el) {
  el.append(h('h1', {}, '没有找到这一课'), h('p', { class: 'muted' }, '链接里的课 id 不对，或者这一课还没有写。'), h('a', { class: 'btn', href: '#/roadmap' }, '回到路线'))
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
  const where = pattern ? `模式讲解：${pattern.name}` : '基础课'
  // 可能为 null 或 false 的段落先过滤：Element.append(null) 会把字面量 "null" 渲染到页面上。
  const sections = [
    h('a', { class: 'muted back-link', href: '#/roadmap' }, '← 路线'),
    h('h1', {}, lesson.title),
    h('p', { class: 'subtitle' }, `${where} · 约 ${lesson.minutes} 分钟`),
    record && h('div', { class: 'notice' }, record.skipped ? `你在 ${record.doneAt} 标记了“已经会了”。` : `你在 ${record.doneAt} 学完了这一课。`),
    h('div', { class: 'card stack' }, h('h3', {}, '学完要能做到'), h('ul', {}, lesson.can.map((x) => h('li', {}, x)))),
    h('div', { class: 'lesson stack' }, lesson.blocks.map(block)),
    warmups.length > 0 && h('section', {}, h('h2', {}, '热身题'), h('p', { class: 'muted' }, '做不出来就看题解，再关掉从空白重写一遍。'),
      h('ul', {}, warmups.map((p) => h('li', {}, h('a', { href: `#/problems?focus=${p.id}` }, problemLabel(p)))))),
    lesson.links.length > 0 && h('section', {}, h('h2', {}, '想深入看'),
      h('ul', {}, lesson.links.map((l) => h('li', {}, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label))))),
    h('div', { class: 'row lesson-actions' },
      !record && h('button', { class: 'btn primary big', onclick: () => mark(false) }, '我学完了'),
      !record && h('button', { class: 'btn', onclick: () => mark(true) }, '我已经会了，跳过'),
      record && h('a', { class: 'btn primary', href: '#/today' }, '回到今天'),
      record && h('button', { class: 'btn', onclick: unmark }, '改回“没学”')),
    msg]
  el.append(...sections.filter(Boolean))
}
