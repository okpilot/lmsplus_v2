import type { QuestionTab } from '../../_components/question-tabs'

export type QuizKeyAction =
  | { type: 'navigate'; delta: number }
  | { type: 'highlight'; delta: number }
  | { type: 'confirm' }
  | { type: 'tab'; tab: QuestionTab }
  | null

const TAB_KEYS: Record<string, QuestionTab> = {
  q: 'question',
  e: 'explanation',
  c: 'comments',
  s: 'statistics',
}

/** True when the event originated from a text-entry control — shortcuts must not fire. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

/**
 * Maps a keydown key to a quiz-runner action, or null when the key is not a
 * shortcut. The q/e/c/s tab shortcuts are suppressed in exam mode (no tabs there).
 */
export function quizKeyAction(key: string, opts: { isExam: boolean }): QuizKeyAction {
  switch (key) {
    case 'ArrowLeft':
      return { type: 'navigate', delta: -1 }
    case 'ArrowRight':
      return { type: 'navigate', delta: 1 }
    case 'ArrowUp':
      return { type: 'highlight', delta: -1 }
    case 'ArrowDown':
      return { type: 'highlight', delta: 1 }
    case 'Enter':
      return { type: 'confirm' }
    default: {
      const tab = TAB_KEYS[key.toLowerCase()]
      return tab && !opts.isExam ? { type: 'tab', tab } : null
    }
  }
}

/**
 * Next answer-highlight index. Wraps around; a first move from "none" (-1) lands
 * on the first option (down) or last option (up). Returns -1 when there are no
 * options.
 */
export function nextHighlight(current: number, delta: number, count: number): number {
  if (count === 0) return -1
  if (current < 0) return delta > 0 ? 0 : count - 1
  return (current + delta + count) % count
}
