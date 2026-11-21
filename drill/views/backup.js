// 备份相关的共用片段：导出进度、导出提醒条。今天页和路线页（设置区）都会用到。
import { h } from './dom.js'
import { needsExportReminder, exportJson } from '../core/store.js'

const REVOKE_DELAY_MS = 1000

// downloadJson 触发浏览器下载一个 JSON 文件。
function downloadJson(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = h('a', { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

// doExport 下载存档并记录导出日期，今天页的提醒条和路线页的设置区都会用到。
export function doExport(ctx) {
  const today = ctx.today()
  // 导出文件里要已经带上今天的 lastExportAt，否则用这份备份恢复后会立刻又提示“还没导出过”。
  const exported = { ...ctx.state, settings: { ...ctx.state.settings, lastExportAt: today } }
  downloadJson(`drill-progress-${today}.json`, exportJson(exported))
  ctx.commit((s) => { s.settings.lastExportAt = today })
  ctx.rerender()
}

// reminderBanner 距上次导出满 7 天（或从未导出）且有进度时显示提醒。
export function reminderBanner(ctx) {
  if (!needsExportReminder(ctx.state, ctx.today())) return null
  const last = ctx.state.settings.lastExportAt
  const text = last ? `距上次导出备份已满 7 天（${last}）。` : '你已经有进度，但还没有导出过备份。'
  return h('div', { class: 'notice row between' }, h('span', {}, `${text}进度只存在这个浏览器里，清除站点数据或换设备都会丢失。`), h('button', { class: 'btn primary', onclick: () => doExport(ctx) }, '立即导出'))
}
