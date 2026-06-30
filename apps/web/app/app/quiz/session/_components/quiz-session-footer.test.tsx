import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizSessionFooter } from './quiz-session-footer'

// QuizSessionFooter is a presentational wrapper: it derives canFlag from
// (s.isExam && examMode === 'internal_exam') and forwards it to QuizControls,
// which conditionally renders the flag button. No hooks are called in
// QuizSessionFooter or QuizControls — safe to render in jsdom.

// ---- Helpers ----------------------------------------------------------------

/**
 * Build a minimal QuizState stub. QuizSessionFooter only reads isExam,
 * isPinned, answering, currentIndex, navigate, togglePin, and handleSelectAnswer.
 */
function makeState(overrides: Partial<QuizState> = {}): QuizState {
  return {
    isExam: false,
    isPinned: false,
    answering: false,
    currentIndex: 0,
    navigate: vi.fn(),
    togglePin: vi.fn(),
    handleSelectAnswer: vi.fn(),
    ...overrides,
  } as unknown as QuizState
}

type FooterProps = Parameters<typeof QuizSessionFooter>[0]

function renderFooter(overrides: Partial<FooterProps> = {}) {
  const props: FooterProps = {
    s: makeState(),
    totalQuestions: 5,
    isFlagged: false,
    flagLoading: false,
    showSubmit: false,
    pendingOptionId: null,
    onToggleFlag: vi.fn(),
    ...overrides,
  }
  render(<QuizSessionFooter {...props} />)
}

// ---- Tests ------------------------------------------------------------------

describe('QuizSessionFooter — canFlag derivation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('hides the flag button during an internal exam', () => {
    renderFooter({ s: makeState({ isExam: true }), examMode: 'internal_exam' })
    expect(screen.queryByTestId('flag-button')).not.toBeInTheDocument()
  })

  it('shows the flag button during a mock exam', () => {
    renderFooter({ s: makeState({ isExam: true }), examMode: 'mock_exam' })
    expect(screen.getByTestId('flag-button')).toBeInTheDocument()
  })

  it('shows the flag button in study and practice modes (isExam false)', () => {
    renderFooter({ s: makeState({ isExam: false }) })
    expect(screen.getByTestId('flag-button')).toBeInTheDocument()
  })
})
