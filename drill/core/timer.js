// 快闪计时：15 分钟分四段，纯逻辑，时间源可注入。

export const SEGMENTS = [
  { key: 'read', label: '读题', seconds: 120 },
  { key: 'design', label: '设计', seconds: 120 },
  { key: 'code', label: '编码', seconds: 480 },
  { key: 'verify', label: '验证', seconds: 180 },
]
export const TOTAL_SECONDS = SEGMENTS.reduce((n, s) => n + s.seconds, 0)
export const NO_KEYBOARD_SECONDS = 300
const FINAL_MINUTE_SECONDS = 60
const FINAL_SECONDS = 10
const MS_PER_SECOND = 1000

// describeElapsed 由已用秒数计算当前分段、剩余时间和视觉提示状态。
export function describeElapsed(elapsedSec) {
  const elapsed = Math.min(TOTAL_SECONDS, Math.max(0, Math.floor(elapsedSec)))
  const remaining = TOTAL_SECONDS - elapsed
  const finished = elapsed >= TOTAL_SECONDS

  let segmentIndex = SEGMENTS.length - 1
  let segmentStart = TOTAL_SECONDS - SEGMENTS[segmentIndex].seconds
  if (!finished) {
    let acc = 0
    for (let i = 0; i < SEGMENTS.length; i++) {
      if (elapsed < acc + SEGMENTS[i].seconds) {
        segmentIndex = i
        segmentStart = acc
        break
      }
      acc += SEGMENTS[i].seconds
    }
  }
  const seg = SEGMENTS[segmentIndex]
  const segmentElapsed = elapsed - segmentStart

  let warning = 'none'
  if (!finished && remaining <= FINAL_SECONDS) warning = 'final-10'
  else if (!finished && remaining <= FINAL_MINUTE_SECONDS) warning = 'final-minute'

  return {
    elapsed,
    remaining,
    finished,
    segmentIndex,
    segment: seg.key,
    segmentLabel: seg.label,
    segmentElapsed,
    segmentRemaining: seg.seconds - segmentElapsed,
    noKeyboard: elapsed < NO_KEYBOARD_SECONDS,
    warning,
  }
}

// createTimer 创建一个可暂停的计时器；now 返回毫秒时间戳，默认 Date.now。
export function createTimer(now = Date.now) {
  let started = false
  let running = false
  let startedAt = 0
  let accumulatedMs = 0

  const elapsedMs = () => accumulatedMs + (running ? now() - startedAt : 0)

  return {
    // start 从 0 开始计时；已在计时时会重置。
    start() {
      started = true
      running = true
      accumulatedMs = 0
      startedAt = now()
    },
    // pause 暂停并保留已用时间。
    pause() {
      if (!running) return
      accumulatedMs += now() - startedAt
      running = false
    },
    // resume 从暂停处继续；未开始或正在计时时无效。
    resume() {
      if (!started || running) return
      running = true
      startedAt = now()
    },
    // reset 回到未开始状态。
    reset() {
      started = false
      running = false
      accumulatedMs = 0
    },
    // snapshot 返回当前状态，包含 describeElapsed 的全部字段。
    snapshot() {
      return { started, running, ...describeElapsed(elapsedMs() / MS_PER_SECOND) }
    },
  }
}

// makeFlashRecord 生成存档 flash 数组的一项；用时取整并限制在 0 到总时长之间（Infinity 记满，NaN、undefined 记 0），保证通过存档校验；completed 表示用户在时限内点了“完成”。
export function makeFlashRecord({ date, problemId, elapsedSeconds, completed }) {
  const floored = Math.floor(elapsedSeconds)
  return {
    date,
    problemId,
    seconds: Number.isNaN(floored) ? 0 : Math.min(TOTAL_SECONDS, Math.max(0, floored)),
    finished: completed,
  }
}
