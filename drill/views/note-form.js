// 复盘表单：顺畅/卡过 + 三行复盘（模式、卡点、边界）。题单视图和快闪视图共用。
import { h } from './dom.js'

// noteForm 返回表单元素；校验通过后调用 onSubmit(note, smooth)，note 为 {pattern, stuck, edge}。
export function noteForm({ submitLabel = '保存', onSubmit, onCancel }) {
  const error = h('p', { class: 'error', role: 'alert' })
  const field = (name, label, placeholder) =>
    h('label', { class: 'stack' }, label, h('input', { name, type: 'text', placeholder, autocomplete: 'off', style: 'width:100%' }))
  const radio = (value, text, checked) =>
    h('label', { class: 'row' }, h('input', { type: 'radio', name: 'flow', value, checked }), text)

  const form = h('form', {
    class: 'card stack',
    onsubmit: (ev) => {
      ev.preventDefault()
      const fd = new FormData(form)
      const note = { pattern: fd.get('pattern').trim(), stuck: fd.get('stuck').trim(), edge: fd.get('edge').trim() }
      if (!note.pattern || !note.stuck || !note.edge) {
        error.textContent = '三行复盘都要填，没有内容就写“无”。'
        return
      }
      onSubmit(note, fd.get('flow') === 'smooth')
    },
  },
  h('div', { class: 'row' }, radio('smooth', '顺畅写完', true), radio('stuck', '卡过（卡点、报错或超时）', false)),
  field('pattern', '模式', '如：滑动窗口'),
  field('stuck', '卡点或错误', '没有就写：无'),
  field('edge', '边界遗漏', '没有就写：无'),
  h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'submit' }, submitLabel), onCancel && h('button', { class: 'btn', type: 'button', onclick: onCancel }, '取消')),
  error)
  // 表单挂到页面后把焦点放到第一个输入框，键盘用户不用再 Tab 过去；preventScroll 避免和“滚动到目标行”互相抢位置。
  queueMicrotask(() => form.querySelector('input[name=pattern]')?.focus({ preventScroll: true }))
  return form
}
