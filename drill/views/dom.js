// 建元素的小工具。所有文本都走 createTextNode，不使用 innerHTML，避免把数据当 HTML 解析。

// h 创建元素：attrs 里 class 设 className，onXxx 绑定事件，布尔 true 设空属性，false/null/undefined 忽略。
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, v)
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || typeof c === 'boolean') continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

// clear 清空元素内容。
export function clear(el) {
  el.replaceChildren()
}

// progressBar 返回一个进度条元素，ratio 取 0 到 1。
export function progressBar(ratio, label) {
  const pct = Math.round(Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0)) * 100)
  const bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': label ?? '进度' })
  bar.append(h('div', { class: 'progress-fill', style: `width:${pct}%` }))
  return bar
}
