import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizKeyboard } from './use-quiz-keyboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPTIONS = ['opt-a', 'opt-b', 'opt-c']

type Opts = Parameters<typeof useQuizKeyboard>[0]

function defaultOpts(overrides: Partial<Opts> = {}): Opts {
  return {
    optionIds: OPTIONS,
    currentIndex: 0,
    isExam: false,
    onNavigate: vi.fn(),
    onConfirm: vi.fn(),
    onTab: vi.fn(),
    ...overrides,
  }
}

function fireKey(key: string, target?: EventTarget) {
  const init: KeyboardEventInit = { key, bubbles: true }
  const event = new KeyboardEvent('keydown', init)
  if (target) {
    // Override the read-only `target` so isTypingTarget sees the right element.
    Object.defineProperty(event, 'target', { value: target, writable: false })
  }
  window.dispatchEvent(event)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// ArrowRight / ArrowLeft → onNavigate
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — navigation keys', () => {
  it('calls onNavigate with +1 on ArrowRight', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowRight')
    })
    expect(opts.onNavigate).toHaveBeenCalledWith(1)
  })

  it('calls onNavigate with -1 on ArrowLeft', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowLeft')
    })
    expect(opts.onNavigate).toHaveBeenCalledWith(-1)
  })
})

// ---------------------------------------------------------------------------
// ArrowDown / ArrowUp → highlight state; Enter → onConfirm
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — highlight and confirm', () => {
  it('moves the highlight to the first option on ArrowDown from no selection', () => {
    const opts = defaultOpts()
    const { result } = renderHook(() => useQuizKeyboard(opts))
    expect(result.current.highlightedOptionId).toBeNull()

    act(() => {
      fireKey('ArrowDown')
    })
    expect(result.current.highlightedOptionId).toBe('opt-a')
  })

  it('moves the highlight to the last option on ArrowUp from no selection', () => {
    const opts = defaultOpts()
    const { result } = renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowUp')
    })
    expect(result.current.highlightedOptionId).toBe('opt-c')
  })

  it('advances the highlight forward through the list on repeated ArrowDown', () => {
    const opts = defaultOpts()
    const { result } = renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowDown')
    })
    act(() => {
      fireKey('ArrowDown')
    })
    expect(result.current.highlightedOptionId).toBe('opt-b')
  })

  it('calls onConfirm with the highlighted option id on Enter', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    // ArrowDown → highlight opt-a; Enter → confirm opt-a
    act(() => {
      fireKey('ArrowDown')
    })
    act(() => {
      fireKey('Enter')
    })
    expect(opts.onConfirm).toHaveBeenCalledWith('opt-a')
  })

  it('does not call onConfirm when no option is highlighted', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('Enter')
    })
    expect(opts.onConfirm).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tab shortcuts (e / c / s)
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — tab shortcuts in study mode', () => {
  it('calls onTab with "question" on q', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('q')
    })
    expect(opts.onTab).toHaveBeenCalledWith('question')
  })

  it('calls onTab with "explanation" on e', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('e')
    })
    expect(opts.onTab).toHaveBeenCalledWith('explanation')
  })

  it('calls onTab with "comments" on c', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('c')
    })
    expect(opts.onTab).toHaveBeenCalledWith('comments')
  })

  it('calls onTab with "statistics" on s', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('s')
    })
    expect(opts.onTab).toHaveBeenCalledWith('statistics')
  })
})

// ---------------------------------------------------------------------------
// Exam mode — tab shortcuts suppressed
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — exam mode suppresses tab shortcuts', () => {
  it('does not call onTab when q is pressed in exam mode', () => {
    const opts = defaultOpts({ isExam: true })
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('q')
    })
    expect(opts.onTab).not.toHaveBeenCalled()
  })

  it('does not call onTab when e is pressed in exam mode', () => {
    const opts = defaultOpts({ isExam: true })
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('e')
    })
    expect(opts.onTab).not.toHaveBeenCalled()
  })

  it('still navigates with ArrowRight in exam mode', () => {
    const opts = defaultOpts({ isExam: true })
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowRight')
    })
    expect(opts.onNavigate).toHaveBeenCalledWith(1)
  })
})

// ---------------------------------------------------------------------------
// enabled === false — all shortcuts ignored
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — disabled state', () => {
  it('ignores all keys when enabled is false', () => {
    const opts = defaultOpts({ enabled: false })
    renderHook(() => useQuizKeyboard(opts))
    act(() => {
      fireKey('ArrowRight')
      fireKey('ArrowDown')
      fireKey('e')
    })
    expect(opts.onNavigate).not.toHaveBeenCalled()
    expect(opts.onTab).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Typing-target guard — shortcuts suppressed when focus is in a text field
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — typing-target guard', () => {
  it('ignores ArrowRight when the event target is an input element', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      fireKey('ArrowRight', input)
    })

    expect(opts.onNavigate).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('ignores e when the event target is a textarea', () => {
    const opts = defaultOpts()
    renderHook(() => useQuizKeyboard(opts))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()

    act(() => {
      fireKey('e', textarea)
    })

    expect(opts.onTab).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })
})

// ---------------------------------------------------------------------------
// Highlight resets when currentIndex changes
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — highlight resets on question change', () => {
  it('clears the highlighted option when currentIndex changes', () => {
    let currentIndex = 0
    const { result, rerender } = renderHook(() => useQuizKeyboard(defaultOpts({ currentIndex })))

    // Establish a highlight
    act(() => {
      fireKey('ArrowDown')
    })
    expect(result.current.highlightedOptionId).toBe('opt-a')

    // Navigate to the next question
    currentIndex = 1
    rerender()

    expect(result.current.highlightedOptionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Wrap-around behaviour
// ---------------------------------------------------------------------------

describe('useQuizKeyboard — wrap-around highlight', () => {
  it('wraps from the last option back to the first on ArrowDown', () => {
    const opts = defaultOpts()
    const { result } = renderHook(() => useQuizKeyboard(opts))
    // Move to last option (3 presses for 3 options)
    act(() => {
      fireKey('ArrowDown')
    })
    act(() => {
      fireKey('ArrowDown')
    })
    act(() => {
      fireKey('ArrowDown')
    })
    expect(result.current.highlightedOptionId).toBe('opt-c')
    // One more wraps to the first
    act(() => {
      fireKey('ArrowDown')
    })
    expect(result.current.highlightedOptionId).toBe('opt-a')
  })
})
