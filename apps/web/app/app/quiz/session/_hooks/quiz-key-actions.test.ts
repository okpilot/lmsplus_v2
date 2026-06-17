import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isTypingTarget, nextHighlight, quizKeyAction } from './quiz-key-actions'

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// isTypingTarget
// ---------------------------------------------------------------------------

describe('isTypingTarget', () => {
  it('returns false for null', () => {
    expect(isTypingTarget(null)).toBe(false)
  })

  it('returns false for a non-HTMLElement EventTarget', () => {
    // SVGElement is an EventTarget but not an HTMLElement
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expect(isTypingTarget(svg)).toBe(false)
  })

  it('returns true for an INPUT element', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
  })

  it('returns true for a TEXTAREA element', () => {
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
  })

  // jsdom does not implement `isContentEditable`, so this tests the jsdom
  // behaviour: the element's `contentEditable` attribute is set but the DOM
  // property is undefined (falsy). The production function returns the truthy
  // value of `el.isContentEditable` — falsy in jsdom, true in real browsers.
  // We can verify the non-contenteditable path returns falsy at minimum.
  it('returns a falsy value for a plain DIV (no text-input semantics)', () => {
    expect(isTypingTarget(document.createElement('div'))).toBeFalsy()
  })

  it('returns a falsy value for a BUTTON element', () => {
    expect(isTypingTarget(document.createElement('button'))).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// quizKeyAction — navigation keys
// ---------------------------------------------------------------------------

describe('quizKeyAction — navigation keys', () => {
  it('maps ArrowLeft to navigate with delta -1', () => {
    expect(quizKeyAction('ArrowLeft', { isExam: false })).toEqual({
      type: 'navigate',
      delta: -1,
    })
  })

  it('maps ArrowRight to navigate with delta +1', () => {
    expect(quizKeyAction('ArrowRight', { isExam: false })).toEqual({
      type: 'navigate',
      delta: 1,
    })
  })

  it('maps ArrowUp to highlight with delta -1', () => {
    expect(quizKeyAction('ArrowUp', { isExam: false })).toEqual({
      type: 'highlight',
      delta: -1,
    })
  })

  it('maps ArrowDown to highlight with delta +1', () => {
    expect(quizKeyAction('ArrowDown', { isExam: false })).toEqual({
      type: 'highlight',
      delta: 1,
    })
  })

  it('maps Enter to confirm', () => {
    expect(quizKeyAction('Enter', { isExam: false })).toEqual({ type: 'confirm' })
  })

  it('maps ArrowLeft to navigate with delta -1 in exam mode', () => {
    expect(quizKeyAction('ArrowLeft', { isExam: true })).toEqual({
      type: 'navigate',
      delta: -1,
    })
  })

  it('maps Enter to confirm in exam mode', () => {
    expect(quizKeyAction('Enter', { isExam: true })).toEqual({ type: 'confirm' })
  })
})

// ---------------------------------------------------------------------------
// quizKeyAction — tab shortcuts (study mode)
// ---------------------------------------------------------------------------

describe('quizKeyAction — tab shortcuts in study mode', () => {
  it('maps q to the question tab', () => {
    expect(quizKeyAction('q', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'question',
    })
  })

  it('maps e to the explanation tab', () => {
    expect(quizKeyAction('e', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'explanation',
    })
  })

  it('maps c to the comments tab', () => {
    expect(quizKeyAction('c', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'comments',
    })
  })

  it('maps s to the statistics tab', () => {
    expect(quizKeyAction('s', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'statistics',
    })
  })

  it('is case-insensitive for q (uppercase Q → question)', () => {
    expect(quizKeyAction('Q', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'question',
    })
  })

  it('is case-insensitive for e (uppercase E → explanation)', () => {
    expect(quizKeyAction('E', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'explanation',
    })
  })

  it('is case-insensitive for c (uppercase C → comments)', () => {
    expect(quizKeyAction('C', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'comments',
    })
  })

  it('is case-insensitive for s (uppercase S → statistics)', () => {
    expect(quizKeyAction('S', { isExam: false })).toEqual({
      type: 'tab',
      tab: 'statistics',
    })
  })
})

// ---------------------------------------------------------------------------
// quizKeyAction — tab shortcuts suppressed in exam mode
// ---------------------------------------------------------------------------

describe('quizKeyAction — tab shortcuts suppressed in exam mode', () => {
  it('returns null for q in exam mode', () => {
    expect(quizKeyAction('q', { isExam: true })).toBeNull()
  })

  it('returns null for e in exam mode', () => {
    expect(quizKeyAction('e', { isExam: true })).toBeNull()
  })

  it('returns null for c in exam mode', () => {
    expect(quizKeyAction('c', { isExam: true })).toBeNull()
  })

  it('returns null for s in exam mode', () => {
    expect(quizKeyAction('s', { isExam: true })).toBeNull()
  })

  it('returns null for uppercase E in exam mode', () => {
    expect(quizKeyAction('E', { isExam: true })).toBeNull()
  })

  it('returns null for uppercase Q in exam mode', () => {
    expect(quizKeyAction('Q', { isExam: true })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// quizKeyAction — unknown keys
// ---------------------------------------------------------------------------

describe('quizKeyAction — unrecognised keys', () => {
  it('returns null for an unrecognised key in study mode', () => {
    expect(quizKeyAction('f', { isExam: false })).toBeNull()
  })

  it('returns null for Escape', () => {
    expect(quizKeyAction('Escape', { isExam: false })).toBeNull()
  })

  it('returns null for Space', () => {
    expect(quizKeyAction(' ', { isExam: false })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// nextHighlight
// ---------------------------------------------------------------------------

describe('nextHighlight', () => {
  it('returns -1 when count is 0 (no options)', () => {
    expect(nextHighlight(-1, 1, 0)).toBe(-1)
    expect(nextHighlight(0, 1, 0)).toBe(-1)
  })

  it('moves to the first option on the first ArrowDown from "none"', () => {
    expect(nextHighlight(-1, 1, 4)).toBe(0)
  })

  it('moves to the last option on the first ArrowUp from "none"', () => {
    expect(nextHighlight(-1, -1, 4)).toBe(3)
  })

  it('advances forward by one', () => {
    expect(nextHighlight(0, 1, 4)).toBe(1)
    expect(nextHighlight(2, 1, 4)).toBe(3)
  })

  it('moves backward by one', () => {
    expect(nextHighlight(3, -1, 4)).toBe(2)
    expect(nextHighlight(1, -1, 4)).toBe(0)
  })

  it('wraps from the last option back to the first on ArrowDown', () => {
    expect(nextHighlight(3, 1, 4)).toBe(0)
  })

  it('wraps from the first option to the last on ArrowUp', () => {
    expect(nextHighlight(0, -1, 4)).toBe(3)
  })

  it('works correctly with a single option (count 1)', () => {
    expect(nextHighlight(-1, 1, 1)).toBe(0)
    expect(nextHighlight(0, 1, 1)).toBe(0)
    expect(nextHighlight(0, -1, 1)).toBe(0)
  })
})
