import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuestionGrid } from './question-grid'

const IDS = ['q1', 'q2', 'q3', 'q4', 'q5']

function renderGrid(overrides: Partial<Parameters<typeof QuestionGrid>[0]> = {}) {
  const props = {
    totalQuestions: 5,
    currentIndex: 0,
    answeredIds: new Set<string>(),
    flaggedIds: new Set<string>(),
    questionIds: IDS,
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

  it('highlights the current question with ring', () => {
    renderGrid({ currentIndex: 2 })
    const btn = screen.getByTestId('grid-btn-2')
    expect(btn.className).toContain('ring-2')
    expect(btn).toHaveAttribute('aria-current', 'step')
  })

  it('does not highlight non-current questions', () => {
    renderGrid({ currentIndex: 0 })
    const btn = screen.getByTestId('grid-btn-3')
    expect(btn.className).not.toContain('ring-2')
    expect(btn).not.toHaveAttribute('aria-current')
  })

  it('shows answered state with primary color', () => {
    renderGrid({ answeredIds: new Set(['q2', 'q4']) })
    const answered = screen.getByTestId('grid-btn-1') // q2 is index 1
    expect(answered.className).toContain('bg-primary/20')
    const unanswered = screen.getByTestId('grid-btn-2')
    expect(unanswered.className).toContain('bg-muted')
  })

  it('shows flagged state with yellow color', () => {
    renderGrid({ flaggedIds: new Set(['q3']) })
    const flagged = screen.getByTestId('grid-btn-2') // q3 is index 2
    expect(flagged.className).toContain('bg-yellow-100')
  })

  it('flagged takes precedence over answered', () => {
    renderGrid({
      answeredIds: new Set(['q1']),
      flaggedIds: new Set(['q1']),
    })
    const btn = screen.getByTestId('grid-btn-0')
    expect(btn.className).toContain('bg-yellow-100')
    expect(btn.className).not.toContain('bg-primary/20')
  })

  it('calls onNavigate with correct index when clicked', () => {
    const { onNavigate } = renderGrid()
    fireEvent.click(screen.getByTestId('grid-btn-3'))
    expect(onNavigate).toHaveBeenCalledWith(3)
  })
})
