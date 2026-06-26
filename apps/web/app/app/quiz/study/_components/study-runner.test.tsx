import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseFlaggedQuestions, mockToggleFlag } = vi.hoisted(() => ({
  mockUseFlaggedQuestions: vi.fn(),
  mockToggleFlag: vi.fn(),
}))

vi.mock('../../session/_hooks/use-flagged-questions', () => ({
  useFlaggedQuestions: () => mockUseFlaggedQuestions(),
}))

// StudyFlashcard is mocked with a lightweight stand-in that renders the
// question text, a flag button, and a data-flag-loading attribute so nav,
// flag-callback, and flagLoading-forwarding tests stay focused on
// StudyRunner's orchestration, not the flashcard's internals.
vi.mock('./study-flashcard', () => ({
  StudyFlashcard: ({
    question,
    isFlagged,
    onToggleFlag,
    flagLoading,
  }: {
    question: { id: string; questionText: string }
    isFlagged: boolean
    onToggleFlag: () => void
    flagLoading: boolean
  }) => (
    <div data-testid={`flashcard-${question.id}`}>
      <span>{question.questionText}</span>
      <button
        type="button"
        data-testid="flag-btn"
        aria-pressed={isFlagged}
        onClick={onToggleFlag}
        data-flag-loading={String(flagLoading)}
      >
        {isFlagged ? 'Unflag' : 'Flag'}
      </button>
    </div>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { StudyRunner } from './study-runner'

// ---- Fixtures -------------------------------------------------------------

function makeQuestion(id: string, text: string): StudyQuestion {
  return {
    id,
    questionText: text,
    questionImageUrl: null,
    options: [{ id: 'a', text: 'A' }],
    correctOptionId: 'a',
    subjectCode: null,
    topicName: null,
    subtopicName: null,
    explanationText: null,
    explanationImageUrl: null,
    questionNumber: null,
    difficulty: null,
  }
}

const Q1 = makeQuestion('q-1', 'First question')
const Q2 = makeQuestion('q-2', 'Second question')
const Q3 = makeQuestion('q-3', 'Third question')

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockUseFlaggedQuestions.mockReturnValue({
    isFlagged: vi.fn(() => false),
    toggleFlag: mockToggleFlag,
    isToggling: vi.fn(() => false),
  })
})

// ---- Empty state ---------------------------------------------------------

describe('StudyRunner — empty state', () => {
  it('shows a no-results message when the questions list is empty', () => {
    render(<StudyRunner questions={[]} onExit={vi.fn()} />)
    expect(screen.getByText('No questions match these filters.')).toBeInTheDocument()
  })

  it('shows a button to choose different filters when the questions list is empty', () => {
    render(<StudyRunner questions={[]} onExit={vi.fn()} />)
    expect(screen.getByRole('button', { name: /choose different filters/i })).toBeInTheDocument()
  })

  it('calls onExit when the choose-different-filters button is clicked', () => {
    const onExit = vi.fn()
    render(<StudyRunner questions={[]} onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: /choose different filters/i }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

// ---- Initial render with questions ---------------------------------------

describe('StudyRunner — initial card', () => {
  it('renders the first question on initial render', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    expect(screen.getByTestId('flashcard-q-1')).toBeInTheDocument()
  })

  it('shows the progress indicator as 1 / total on initial render', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    expect(screen.getByTestId('study-progress')).toHaveTextContent('1 / 3')
  })
})

// ---- Button navigation ---------------------------------------------------

describe('StudyRunner — button navigation', () => {
  it('advances to the next card when the Next button is clicked', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    expect(screen.getByTestId('flashcard-q-2')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('2 / 3')
  })

  it('goes back to the first card when Previous is clicked after advancing', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    })
    expect(screen.getByTestId('flashcard-q-1')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('1 / 3')
  })

  it('stays on the first card when Previous is clicked at the start', () => {
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    })
    expect(screen.getByTestId('flashcard-q-1')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('1 / 2')
  })

  it('stays on the last card when Next is clicked at the end', () => {
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    expect(screen.getByTestId('flashcard-q-2')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('2 / 2')
  })
})

// ---- Keyboard navigation -------------------------------------------------

describe('StudyRunner — keyboard navigation', () => {
  it('advances to the next card when ArrowRight is pressed', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('flashcard-q-2')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('2 / 3')
  })

  it('goes to the previous card when ArrowLeft is pressed after advancing', () => {
    render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('flashcard-q-1')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('1 / 3')
  })
})

// ---- "New set" button ----------------------------------------------------

describe('StudyRunner — "New set" button', () => {
  it('calls onExit when the New set button is clicked', () => {
    const onExit = vi.fn()
    render(<StudyRunner questions={[Q1, Q2]} onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: /new set/i }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

// ---- Index clamping when questions shrink -----------------------------------

describe('StudyRunner — index clamping on prop change', () => {
  it('shows the new last card when the question set shrinks and current position is beyond the new end', () => {
    const onExit = vi.fn()
    const { rerender } = render(<StudyRunner questions={[Q1, Q2, Q3]} onExit={onExit} />)
    // Navigate to the third card (index 2)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    expect(screen.getByTestId('flashcard-q-3')).toBeInTheDocument()
    // Shrink to two questions — index 2 is now out of range
    act(() => {
      rerender(<StudyRunner questions={[Q1, Q2]} onExit={onExit} />)
    })
    // Index must be clamped to 1 (the new last position)
    expect(screen.getByTestId('flashcard-q-2')).toBeInTheDocument()
    expect(screen.getByTestId('study-progress')).toHaveTextContent('2 / 2')
  })

  it('shows the empty-state message when the question set empties while the user is mid-session', () => {
    const onExit = vi.fn()
    const { rerender } = render(<StudyRunner questions={[Q1, Q2]} onExit={onExit} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    expect(screen.getByTestId('flashcard-q-2')).toBeInTheDocument()
    // Empty the set entirely
    act(() => {
      rerender(<StudyRunner questions={[]} onExit={onExit} />)
    })
    expect(screen.getByText('No questions match these filters.')).toBeInTheDocument()
  })

  it('does not set a negative index when ArrowRight is pressed while the question list is empty', () => {
    const onExit = vi.fn()
    const { rerender } = render(<StudyRunner questions={[Q1]} onExit={onExit} />)
    act(() => {
      rerender(<StudyRunner questions={[]} onExit={onExit} />)
    })
    // Keyboard listener is still attached; pressing ArrowRight must not crash
    // and the empty-state view must remain visible
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('No questions match these filters.')).toBeInTheDocument()
  })
})

// ---- Flag button ---------------------------------------------------------

describe('StudyRunner — flag button', () => {
  it('shows the flag button in the unflagged state for the current question', () => {
    mockUseFlaggedQuestions.mockReturnValue({
      isFlagged: vi.fn(() => false),
      toggleFlag: mockToggleFlag,
      isToggling: vi.fn(() => false),
    })
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    const flagBtn = screen.getByTestId('flag-btn')
    expect(flagBtn).toHaveAttribute('aria-pressed', 'false')
    expect(flagBtn).toHaveTextContent('Flag')
  })

  it('shows the flag button in the flagged state when the current question is flagged', () => {
    mockUseFlaggedQuestions.mockReturnValue({
      isFlagged: vi.fn(() => true),
      toggleFlag: mockToggleFlag,
      isToggling: vi.fn(() => false),
    })
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    const flagBtn = screen.getByTestId('flag-btn')
    expect(flagBtn).toHaveAttribute('aria-pressed', 'true')
    expect(flagBtn).toHaveTextContent('Unflag')
  })

  it('toggles the flag on the current card when the flag button is clicked', () => {
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    fireEvent.click(screen.getByTestId('flag-btn'))
    expect(mockToggleFlag).toHaveBeenCalledWith('q-1')
  })

  it('toggles the flag on the second card after navigating to the next card', () => {
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /next/i }))
    })
    fireEvent.click(screen.getByTestId('flag-btn'))
    expect(mockToggleFlag).toHaveBeenCalledWith('q-2')
  })

  it('shows the current card as loading while a flag toggle is in progress', () => {
    mockUseFlaggedQuestions.mockReturnValue({
      isFlagged: vi.fn(() => false),
      toggleFlag: mockToggleFlag,
      isToggling: vi.fn(() => true),
    })
    render(<StudyRunner questions={[Q1, Q2]} onExit={vi.fn()} />)
    expect(screen.getByTestId('flag-btn')).toHaveAttribute('data-flag-loading', 'true')
  })
})
