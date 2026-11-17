// 识别训练：随机抽题、生成选项、计分。纯逻辑，随机源可注入。

export const QUIZ_SECONDS_PER_QUESTION = 30
export const QUIZ_MIN = 5
export const QUIZ_MAX = 8
const DEFAULT_OPTION_COUNT = 4

// shuffle 返回打乱后的新数组（Fisher-Yates），不修改入参。
// rng 必须返回 [0, 1)，返回 1 会让数组越界。
export function shuffle(arr, rng = Math.random) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// buildQuestion 为一道题生成选项：正确模式加若干个随机干扰模式，整体打乱。
// patterns 里找不到题目的模式时抛出错误，避免生成没有正确答案的题。
export function buildQuestion(problem, patterns, rng = Math.random, optionCount = DEFAULT_OPTION_COUNT) {
  const correct = patterns.find((p) => p.id === problem.pattern)
  if (!correct) throw new Error(`题目 ${problem.id} 的模式 ${problem.pattern} 不存在`)
  const distractors = shuffle(patterns.filter((p) => p.id !== problem.pattern), rng).slice(0, optionCount - 1)
  const options = shuffle([correct, ...distractors], rng).map((p) => ({ id: p.id, name: p.name }))
  return {
    problemId: problem.id,
    title: problem.title,
    summary: problem.summary,
    level: problem.level,
    options,
    answer: problem.pattern,
  }
}

// buildQuiz 随机抽 n 道互不重复的题（n 钳制在 1 到题目总数之间）并生成题目。
export function buildQuiz(problems, patterns, n, rng = Math.random) {
  if (problems.length === 0) return []
  const count = Math.min(problems.length, Math.max(1, n))
  return shuffle(problems, rng).slice(0, count).map((p) => buildQuestion(p, patterns, rng))
}

// scoreQuiz 按题目顺序对答案；答案为 null（超时）或不匹配都算错。
export function scoreQuiz(questions, answers) {
  const wrong = []
  let correct = 0
  questions.forEach((q, i) => {
    if (answers[i] === q.answer) correct++
    else wrong.push(q.problemId)
  })
  return { total: questions.length, correct, wrong }
}

// makeRecognitionRecord 生成存档 recognition 数组的一项。
export function makeRecognitionRecord(date, result) {
  return { date, total: result.total, correct: result.correct }
}
