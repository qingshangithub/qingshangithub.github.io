// 讲解正文的行内标记：`代码` 和 **加粗**。只做分词，渲染由视图完成（不使用 innerHTML）。

const TOKEN_RE = /(`[^`]+`|\*\*[^*]+\*\*)/

// tokenizeInline 把一段文字拆成 [{t:'text'|'code'|'strong', text}]，标记符号本身不进入 text；没有配对的标记按普通文字处理。
export function tokenizeInline(text) {
  const out = []
  for (const part of String(text).split(TOKEN_RE)) {
    if (part === '') continue
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) out.push({ t: 'code', text: part.slice(1, -1) })
    else if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) out.push({ t: 'strong', text: part.slice(2, -2) })
    else out.push({ t: 'text', text: part })
  }
  return out
}
