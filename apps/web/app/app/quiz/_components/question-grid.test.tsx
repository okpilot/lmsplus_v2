import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuestionGrid } from './question-grid'

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5']
const MANY_IDS = Array.from({ length: 40 }, (_, i) => `q${i + 1}`)

// Mock ResizeObserver — jsdom has no layout engine
let resizeCallback: ResizeObserverCallback
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb
      }
      observe() {
        // Trigger initial measurement
        resizeCallback([], this as unknown as ResizeObserver)
      }
      disconnect() {}
    },
  )
})
afterEach(() => {
  vi.restoreAllMocks()
})

function renderGrid(overrides: Partial<Parameters<typeof QuestionGrid>[0]> = {}) {
  const props = {
    totalQuestions: 5,
    currentIndex: 0,
    pinnedIds: new Set<string>(),
    flaggedIds: new Set<string>(),
    questionIds: IDS,
    feedbackMap: new Map<string, { isCorrect: boolean }>(),
    onNavigate: vi.fn(),
    ...overrides,
  }
  render(<QuestionGrid {...props} />)
  return props
}

/** Helper: query a button inside the desktop grid container */
function desktopBtn(index: number) {
  const grid = screen.getByTestId('question-grid')
  return grid.querySelector(`[data-testid="grid-btn-${index}"]`) as HTMLElement
}

describe('QuestionGrid — desktop', () => {
  it('renders correct number of buttons', () => {
    renderGrid()
    const grid = screen.getByTestId('question-grid')
    const buttons = grid.querySelectorAll('button')
    expect(buttons).toHaveLength(5)
    expect(buttons[0]).toHaveTextContent('1')
    expect(buttons[4]).toHaveTextContent('5')
  })

  it('highlights current question with primary color', () => {
    renderGrid({ currentIndex: 2 })
    const btn = desktopBtn(2)
    expect(btn.className).toContain('bg-primary')
    expect(btn).toHaveAttribute('aria-current', 'step')
  })

  it('shows correct answer with green', () => {
    const feedbackMap = new Map([['q2', { isCorrect: true }]])
    renderGrid({ feedbackMap })
    expect(desktopBtn(1).className).toContain('bg-green-500')
  })

  it('shows incorrect answer with red', () => {
    const feedbackMap = new Map([['q3', { isCorrect: false }]])
    renderGrid({ feedbackMap })
    expect(desktopBtn(2).className).toContain('bg-red-500')
  })

  it('shows unanswered with border only', () => {
    renderGrid()
    const btn = desktopBtn(3)
    expect(btn.className).toContain('border')
    expect(btn.className).toContain('text-muted-foreground')
  })

  it('current question overrides correct/incorrect color', () => {
    const feedbackMap = new Map([['q1', { isCorrect: true }]])
    renderGrid({ currentIndex: 0, feedbackMap })
    expect(desktopBtn(0).className).toContain('bg-primary')
  })

  it('calls onNavigate with correct index when clicked', () => {
    const { onNavigate } = renderGrid()
    fireEvent.click(desktopBtn(3))
    expect(onNavigate).toHaveBeenCalledWith(3)
  })

  it('includes flagged in aria-label', () => {
    renderGrid({ flaggedIds: new Set(['q2']) })
    expect(desktopBtn(1)).toHaveAttribute('aria-label', 'Question 2, flagged')
  })

  it('includes pinned in aria-label', () => {
    renderGrid({ pinnedIds: new Set(['q3']) })
    expect(desktopBtn(2)).toHaveAttribute('aria-label', 'Question 3, pinned')
  })

  it('always shows all questions on desktop', () => {
    renderGrid({ totalQuestions: 40, questionIds: MANY_IDS })
    const grid = screen.getByTestId('question-grid')
    expect(grid.querySelectorAll('button')).toHaveLength(40)
  })
})

describe('QuestionGrid — filter row', () => {
  it('does not show filter row when nothing is flagged or pinned', () => {
    renderGrid()
    expect(screen.queryByTestId('grid-filters')).not.toBeInTheDocument()
  })

  it('shows filter row when questions are flagged', () => {
    renderGrid({ flaggedIds: new Set(['q1']) })
    expect(screen.getByTestId('grid-filters')).toBeInTheDocument()
    expect(screen.getByTestId('filter-flagged')).toHaveTextContent('Flagged (1)')
  })

  it('shows filter row when questions are pinned', () => {
    renderGrid({ pinnedIds: new Set(['q2', 'q3']) })
    expect(screen.getByTestId('grid-filters')).toBeInTheDocument()
    expect(screen.getByTestId('filter-pinned')).toHaveTextContent('Pinned (2)')
  })

  it('hides non-flagged squares when flagged filter is active', () => {
    renderGrid({ flaggedIds: new Set(['q2']) })
    fireEvent.click(screen.getByTestId('filter-flagged'))
    // q2 (index 1) is flagged — should be visible
    expect(desktopBtn(1)).toBeTruthy()
    // q3 (index 2) is not flagged — should be hidden
    expect(desktopBtn(2)).toBeNull()
  })

  it('hides non-pinned squares when pinned filter is active', () => {
    renderGrid({ pinnedIds: new Set(['q1']) })
    fireEvent.click(screen.getByTestId('filter-pinned'))
    expect(desktopBtn(0)).toBeTruthy()
    expect(desktopBtn(3)).toBeNull()
  })

  it('shows all squares when All filter is re-selected', () => {
    renderGrid({ flaggedIds: new Set(['q2']) })
    fireEvent.click(screen.getByTestId('filter-flagged'))
    expect(desktopBtn(3)).toBeNull()
    fireEvent.click(screen.getByText('All'))
    expect(desktopBtn(3)).toBeTruthy()
  })
})

describe('QuestionGrid — mobile collapse', () => {
  // jsdom offsetWidth = 0 → perRow defaults to max(floor(0+6)/(36+6), 1) = 1
  // So twoRows = 2, needsCollapse = totalQuestions > 2
  // With 5 questions: needs collapse. With mocked width we'd get proper counts.
  // For these tests we validate the toggle and expand behavior.

  it('shows toggle button for large quizzes', () => {
    renderGrid({ totalQuestions: 40, questionIds: MANY_IDS })
    expect(screen.getByTestId('grid-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('grid-toggle')).toHaveTextContent(/Show all.*40/)
  })

  it('shows all squares when expanded', () => {
    renderGrid({ totalQuestions: 40, questionIds: MANY_IDS })
    fireEvent.click(screen.getByTestId('grid-toggle'))
    const mobileGrid = screen.getByTestId('question-grid-mobile')
    expect(mobileGrid.querySelectorAll('button')).toHaveLength(40)
    expect(screen.getByTestId('grid-toggle')).toHaveTextContent('Hide')
  })

  it('collapses back when toggle is clicked again', () => {
    renderGrid({ totalQuestions: 40, questionIds: MANY_IDS })
    fireEvent.click(screen.getByTestId('grid-toggle'))
    fireEvent.click(screen.getByTestId('grid-toggle'))
    const mobileGrid = screen.getByTestId('question-grid-mobile')
    expect(mobileGrid.querySelectorAll('button').length).toBeLessThan(40)
  })

  it('does not show toggle for small quizzes that fit in 2 rows', () => {
    // Simulate a wide container: 390px → perRow = 9 → twoRows = 18
    // With only 5 questions, no collapse needed
    // But jsdom has 0 width → perRow = 1 → twoRows = 2 → collapse triggers
    // This is a jsdom limitation; we test the toggle-free path separately
    renderGrid({ totalQuestions: 1, questionIds: ['q1'] })
    expect(screen.queryByTestId('grid-toggle')).not.toBeInTheDocument()
  })
})
