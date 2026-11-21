// 学习进度与学习队列：新手路径。纯函数，不依赖 DOM，完成情况全部从存档推出。
import { LEVEL_LABELS, problemLabel } from './filters.js'

export const FLASH_UNLOCK_PATTERNS = 3
export const QUIZ_UNLOCK_PATTERNS = 5

// has 判断 obj 自己有没有 key；存档里的 id 来自 JSON，不能让 constructor 这类原型链上的名字算作“有记录”。
function has(obj, key) {
  return Object.hasOwn(obj, key)
}

// lessonDone 课有记录（学完或跳过）就算学过。
export function lessonDone(state, id) {
  return has(state.lessons, id)
}

// byOrder 按 order 升序。
function byOrder(a, b) {
  return a.order - b.order
}

// lessonItem 一课对应的学习项。
function lessonItem(lesson, pattern) {
  const where = pattern ? `${pattern.name}：` : ''
  return {
    type: 'lesson', id: lesson.id, patternId: pattern?.id ?? null,
    title: `读讲解：${lesson.title}`,
    detail: `${where}约 ${lesson.minutes} 分钟。学完点“我学完了”；已经会了可以跳过。`,
    href: `#/learn?id=${lesson.id}`, cta: '去学习',
  }
}

// problemItem 一道核心题对应的学习项。
function problemItem(problem, pattern) {
  return {
    type: 'problem', id: problem.id, patternId: pattern.id,
    title: `做题：${problemLabel(problem)}`,
    detail: `${pattern.name} · ${LEVEL_LABELS[problem.level]}。卡住 10 分钟没有思路就看题解，再关掉从空白重写。`,
    href: `#/problems?focus=${problem.id}`, cta: '去做题',
  }
}

// templateItem 一个模式的模板卡默写对应的学习项。
function templateItem(pattern) {
  return {
    type: 'template', id: pattern.id, patternId: pattern.id,
    title: `默写模板卡：${pattern.name}`,
    detail: '先遮住实现，只看函数签名默写，再对照参考实现自评。',
    href: `#/templates?id=${pattern.id}`, cta: '去默写',
  }
}

// patternProgress 一个模式的学习情况：讲解是否还没学、没做的核心题、模板卡是否默写过，三项都完成才算学完。
// 模式没有讲解（讲解还没写）时不要求讲解。
function patternProgress(state, data, pattern, lessonByPattern) {
  const lesson = lessonByPattern.get(pattern.id) ?? null
  const lessonPending = lesson !== null && !lessonDone(state, lesson.id) ? lesson : null
  const coreUndone = data.problems
    .filter((p) => p.pattern === pattern.id && p.core && !has(state.problems, p.id))
    .sort((a, b) => a.seq - b.seq)
  const templateDone = has(state.templates, pattern.id)
  return { pattern, lesson, lessonPending, coreUndone, templateDone, complete: lessonPending === null && coreUndone.length === 0 && templateDone }
}

// lessonsByPattern 模式 id → 该模式的讲解。
function lessonsByPattern(data) {
  return new Map(data.lessons.filter((l) => l.kind === 'pattern').map((l) => [l.patternId, l]))
}

// baseLessons 阶段 0 的课，按顺序。
function baseLessons(data) {
  return data.lessons.filter((l) => l.kind === 'base').sort(byOrder)
}

// learningProgress 汇总学习进度：各课和各模式的完成情况、已学完的模式数、当前阶段和当前模式。
// stage：还有没学的基础课是 base；基础课学完后还有没学完的模式是 patterns；模式都学完是 interview。
export function learningProgress(state, data) {
  const byPattern = lessonsByPattern(data)
  const base = baseLessons(data).map((lesson) => ({ lesson, done: lessonDone(state, lesson.id) }))
  const patterns = [...data.patterns].sort(byOrder).map((p) => patternProgress(state, data, p, byPattern))
  const completedPatterns = patterns.filter((p) => p.complete).length
  const current = patterns.find((p) => !p.complete) ?? null
  let stage = 'interview'
  if (base.some((b) => !b.done)) stage = 'base'
  else if (current) stage = 'patterns'
  return { base, patterns, completedPatterns, stage, currentPattern: current ? current.pattern : null }
}

// learningQueue 按顺序列出所有还没做的学习项：先是阶段 0 没学的课，再按模式顺序，每个没学完的模式依次是讲解、核心题、模板卡。
// 非核心题不在队列里，它们是加练。
export function learningQueue(state, data) {
  const byPattern = lessonsByPattern(data)
  const items = []
  for (const lesson of baseLessons(data)) {
    if (!lessonDone(state, lesson.id)) items.push(lessonItem(lesson, null))
  }
  for (const pattern of [...data.patterns].sort(byOrder)) {
    const prog = patternProgress(state, data, pattern, byPattern)
    if (prog.complete) continue
    if (prog.lessonPending) items.push(lessonItem(prog.lessonPending, pattern))
    for (const p of prog.coreUndone) items.push(problemItem(p, pattern))
    if (!prog.templateDone) items.push(templateItem(pattern))
  }
  return items
}
