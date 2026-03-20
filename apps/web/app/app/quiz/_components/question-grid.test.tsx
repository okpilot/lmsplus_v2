import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionGrid } from './question-grid'

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5']

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

describe('QuestionGrid', () => {
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
    const btn = screen.getByTestId('grid-btn-2')
    expect(btn.className).toContain('bg-primary')
    expect(btn).toHaveAttribute('aria-current', 'step')
  })

  it('does not highlight non-current questions', () => {
    renderGrid({ currentIndex: 0 })
    const btn = screen.getByTestId('grid-btn-3')
    expect(btn.className).not.toContain('bg-primary')
    expect(btn).not.toHaveAttribute('aria-current')
  })

  it('shows correct answer with green', () => {
    const feedbackMap = new Map([['q2', { isCorrect: true }]])
    renderGrid({ feedbackMap })
    const btn = screen.getByTestId('grid-btn-1') // q2 is index 1
    expect(btn.className).toContain('bg-green-500')
  })

  it('shows incorrect answer with red', () => {
    const feedbackMap = new Map([['q3', { isCorrect: false }]])
    renderGrid({ feedbackMap })
    const btn = screen.getByTestId('grid-btn-2') // q3 is index 2
    expect(btn.className).toContain('bg-red-500')
  })

  it('shows unanswered with border only', () => {
    renderGrid()
    const btn = screen.getByTestId('grid-btn-3')
    expect(btn.className).toContain('border')
    expect(btn.className).toContain('text-muted-foreground')
  })

  it('current question overrides correct/incorrect color', () => {
    const feedbackMap = new Map([['q1', { isCorrect: true }]])
    renderGrid({ currentIndex: 0, feedbackMap })
    const btn = screen.getByTestId('grid-btn-0')
    expect(btn.className).toContain('bg-primary')
    expect(btn.className).not.toContain('bg-green-500')
  })

  it('shows pinned state with amber bottom border', () => {
    renderGrid({ pinnedIds: new Set(['q3']) })
    const btn = screen.getByTestId('grid-btn-2')
    expect(btn.className).toContain('border-amber-400')
  })

  it('shows flagged icon for flagged questions', () => {
    renderGrid({ flaggedIds: new Set(['q2']) })
    const btn = screen.getByTestId('grid-btn-1')
    expect(btn.querySelector('svg')).toBeTruthy()
    expect(btn).toHaveAttribute('aria-label', 'Question 2, flagged')
  })

  it('shows both flagged and pinned indicators', () => {
    renderGrid({ flaggedIds: new Set(['q1']), pinnedIds: new Set(['q1']) })
    const btn = screen.getByTestId('grid-btn-0')
    const svgs = btn.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)
    expect(btn).toHaveAttribute('aria-label', 'Question 1, flagged, pinned')
  })

  it('calls onNavigate with correct index when clicked', () => {
    const { onNavigate } = renderGrid()
    fireEvent.click(screen.getByTestId('grid-btn-3'))
    expect(onNavigate).toHaveBeenCalledWith(3)
  })
})
