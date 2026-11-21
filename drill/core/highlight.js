// Go 代码的简易着色：只切词，不解析语法。不依赖 DOM。

const KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if',
  'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var',
])
const TYPES = new Set([
  'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
  'float32', 'float64', 'string', 'bool', 'byte', 'rune', 'error', 'any',
])
const BUILTINS = new Set([
  'len', 'cap', 'make', 'new', 'append', 'copy', 'delete', 'panic', 'recover', 'print', 'println', 'min', 'max', 'clear', 'close',
  'nil', 'true', 'false', 'iota',
])

// 依次匹配：行注释、字符串（双引号、反引号、单引号）、数字、标识符。
const TOKEN = /(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"|`[^`]*`|'(?:\\.|[^'\\\n])+')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g

// classify 判断一个标识符的类别；后面紧跟左括号且不是关键字、类型或内建名的，当作函数名。
function classify(word, next) {
  if (KEYWORDS.has(word)) return 'kw'
  if (TYPES.has(word)) return 'type'
  if (BUILTINS.has(word)) return 'builtin'
  return next === '(' ? 'fn' : 'plain'
}

// push 追加一个片段；相邻的普通文本合并，减少节点数。
function push(out, t, text) {
  const last = out[out.length - 1]
  if (t === 'plain' && last && last.t === 'plain') last.text += text
  else out.push({ t, text })
}

// tokenizeGo 把 Go 代码切成 { t, text } 片段，t 是 kw、type、builtin、fn、str、num、com 或 plain；所有片段的 text 拼起来等于原文。
export function tokenizeGo(code) {
  const out = []
  let last = 0
  for (const m of code.matchAll(TOKEN)) {
    if (m.index > last) push(out, 'plain', code.slice(last, m.index))
    const [text, comment, str, num, word] = m
    const end = m.index + text.length
    if (comment) push(out, 'com', text)
    else if (str) push(out, 'str', text)
    else if (num) push(out, 'num', text)
    else push(out, classify(word, code[end]), text)
    last = end
  }
  if (last < code.length) push(out, 'plain', code.slice(last))
  return out
}
