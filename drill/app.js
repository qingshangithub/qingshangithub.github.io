// 入口：加载数据与存档，hash 路由，全局提示条。视图按需动态导入，见 views/。
import { today } from './core/dates.js'
import { pickStorage, createStore } from './core/store.js'
import { h, clear } from './views/dom.js'

// group 是导航里高亮的入口：快闪、识别、复习不单独占导航位，归在“练习”下。
const ROUTES = [
  { path: 'today', label: '今天', group: 'today', load: () => import('./views/today.js') },
  { path: 'roadmap', label: '路线', group: 'roadmap', load: () => import('./views/roadmap.js') },
  { path: 'learn', label: '讲解', group: 'roadmap', load: () => import('./views/learn.js') },
  { path: 'problems', label: '题单', group: 'problems', load: () => import('./views/problems.js') },
  { path: 'templates', label: '模板卡', group: 'templates', load: () => import('./views/templates.js') },
  { path: 'practice', label: '练习', group: 'practice', load: () => import('./views/practice.js') },
  { path: 'flash', label: '快闪', group: 'practice', load: () => import('./views/flash.js') },
  { path: 'quiz', label: '识别训练', group: 'practice', load: () => import('./views/quiz.js') },
  { path: 'review', label: '复习', group: 'practice', load: () => import('./views/review.js') },
]
// NAV 顶部导航的五个入口，每个入口对应一个 group。
const NAV = ['today', 'roadmap', 'problems', 'templates', 'practice']

const root = document.getElementById('app')
const nav = document.getElementById('nav')
const banners = document.getElementById('banners')
const topbar = document.querySelector('.topbar')

let ctx = null
let cleanup = null
let renderToken = 0
let listening = false // hashchange 只注册一次，boot 重试时不重复注册

// syncTopbarHeight 把顶栏高度写进 --topbar-h，让提示条能紧贴在固定顶栏下方。
function syncTopbarHeight() {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`)
}
syncTopbarHeight()
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncTopbarHeight).observe(topbar)

// parseHash 解析 #/path?k=v。
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, query = ''] = raw.split('?')
  return { path: path || ROUTES[0].path, params: new URLSearchParams(query) }
}

// showBanner 显示（或替换）一条全局提示；kind 为 'danger' 时用红色。
function showBanner(id, text, kind = 'warn') {
  hideBanner(id)
  banners.append(h('div', { class: `banner ${kind}`, 'data-banner': id, role: kind === 'danger' ? 'alert' : 'status' }, text))
}

// hideBanner 移除一条全局提示。
function hideBanner(id) {
  banners.querySelectorAll(`[data-banner="${id}"]`).forEach((el) => el.remove())
}

// renderNav 渲染导航，当前路由所属的入口加 aria-current。
function renderNav(group) {
  clear(nav)
  for (const path of NAV) {
    const r = ROUTES.find((x) => x.path === path)
    nav.append(h('a', { href: `#/${r.path}`, 'aria-current': r.group === group ? 'page' : null }, r.label))
  }
}

// runCleanup 执行并清空上一个视图的清理函数；清理失败只记日志，不能阻断路由。
function runCleanup() {
  const fn = cleanup
  cleanup = null
  if (typeof fn !== 'function') return
  try {
    fn()
  } catch (e) {
    console.error('视图清理失败', e)
  }
}

// renderRoute 清理上一个视图，加载并挂载当前路由的视图；keepScroll 为 true 时（重绘当前页）保持滚动位置，否则回到顶部。
async function renderRoute({ keepScroll = false } = {}) {
  const y = keepScroll ? window.scrollY : 0
  const token = ++renderToken
  const { path, params } = parseHash()
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0]
  runCleanup()
  document.title = `${route.label} · 手撕训练站`
  renderNav(route.group)
  clear(root)
  try {
    const view = await route.load()
    if (token !== renderToken) return
    const result = view.mount(ctx, params, root)
    cleanup = typeof result === 'function' ? result : null
    window.scrollTo(0, y)
  } catch (e) {
    if (token !== renderToken) return
    clear(root)
    root.append(h('p', { class: 'error' }, `页面加载失败：${e.message}`))
  }
}

// loadJson 读取并解析一个 JSON 文件。
async function loadJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} 加载失败（HTTP ${res.status}）`)
  return res.json()
}

// indexBy 按 id 建索引。用无原型对象：URL 参数或存档里的 id 可能是 constructor、toString、__proto__ 这类名字，
// 普通对象会把它们解析成 Object.prototype 上的成员，被当成“存在的题目”。
function indexBy(list) {
  return Object.assign(Object.create(null), Object.fromEntries(list.map((x) => [x.id, x])))
}

// loadData 加载题单、模板卡和讲解，并建立按 id 查找的索引。
async function loadData() {
  const [problemsFile, patternsFile, lessonsFile] = await Promise.all([loadJson('data/problems.json'), loadJson('data/patterns.json'), loadJson('data/lessons.json')])
  return {
    problems: problemsFile.problems,
    patterns: problemsFile.patterns,
    lessons: lessonsFile.lessons,
    lessonById: indexBy(lessonsFile.lessons),
    cards: indexBy(patternsFile.patterns),
    byId: indexBy(problemsFile.problems),
    patternById: indexBy(problemsFile.patterns),
  }
}

// buildCtx 组装传给视图的上下文。
function buildCtx(data, store, state) {
  const c = {
    data,
    state,
    persistent: store.persistent,
    today: () => today(),
    rerender: () => renderRoute({ keepScroll: true }),
    navigate(path, params = {}) {
      const qs = new URLSearchParams(params).toString()
      const next = `#/${path}${qs ? `?${qs}` : ''}`
      if (location.hash === next) renderRoute()
      else location.hash = next
    },
    // sync 把另一个标签页写入的较新存档载入内存，返回内存状态是否被替换；不重绘，由调用方决定要不要刷新界面。
    sync() {
      const fresh = store.latest()
      if (fresh === null) return false
      c.state = fresh
      return true
    },
    // commit 先同步其他标签页的存档，再在最新状态上执行改动并保存，避免旧标签页整份写回、覆盖别处的进度。
    commit(mutator) {
      c.sync()
      mutator(c.state)
      const r = store.save(c.state)
      if (r.ok) hideBanner('save-error')
      else showBanner('save-error', `进度保存失败：${r.error}。请先在“路线”页导出备份。`, 'danger')
      return r
    },
    // replaceState 用导入的存档整体替换：走 store.restore（用户已确认覆盖，可解除暂停保存），成功后重新渲染；失败则保持原状态并提示。
    replaceState(next) {
      const r = store.restore(next)
      if (!r.ok) {
        showBanner('save-error', `导入失败，进度未写入：${r.error}`, 'danger')
        return r
      }
      c.state = next
      hideBanner('save-error')
      hideBanner('corrupt')
      renderRoute()
      return r
    },
  }
  return c
}

// showFatal 显示加载失败和重试按钮。
function showFatal(message) {
  clear(root)
  root.append(h('p', { class: 'error' }, message), h('button', { class: 'btn primary', onclick: (e) => { e.target.disabled = true; boot() } }, '重试'))
}

// boot 初始化：存档、数据、路由。
async function boot() {
  hideBanner('corrupt')
  hideBanner('memory')
  const { storage, persistent } = pickStorage(window)
  const store = createStore({ storage, persistent, today })
  const loaded = store.load()
  if (!persistent) showBanner('memory', '当前浏览器不允许保存数据（可能是隐私模式），进度不会保存，请及时在“路线”页导出备份。', 'danger')
  if (loaded.corrupt && loaded.backedUp) showBanner('corrupt', `本地存档损坏（${loaded.error}），已使用空存档。原始内容保存在 localStorage 的 drill.v1.corrupt，可在“路线”页导入备份文件恢复。`, 'danger')
  else if (loaded.corrupt) showBanner('corrupt', `本地存档损坏（${loaded.error}），而且无法备份原内容（${store.isBlocked()}）。为避免覆盖原数据，已暂停自动保存。请先在“路线”页导入备份文件恢复。`, 'danger')
  Promise.resolve(navigator.storage?.persist?.()).catch(() => {})

  let data
  try {
    data = await loadData()
  } catch (e) {
    showFatal(`题单数据加载失败：${e.message}`)
    return
  }
  ctx = buildCtx(data, store, loaded.state)
  if (!listening) {
    window.addEventListener('hashchange', () => renderRoute())
    listening = true
  }
  renderRoute()
}

boot()
