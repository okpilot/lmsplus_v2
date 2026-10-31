import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSquares } from './question-grid-squares'

function squares(currentIndex = 1) {
  render(
    <div>
      {buildSquares({
        totalQuestions: 3,
        currentIndex,
        filter: 'all',
        questionIds: ['q0', 'q1', 'q2'],
        flaggedIds: new Set(),
        pinnedIds: new Set(),
        feedbackMap: new Map(),
        onNavigate: () => {},
      })}
    </div>,
  )
}

describe('question grid squares (Button variant bare)', () => {
  it('renders type=button squares with grid-btn-N testids', () => {
    squares()
    for (const i of [0, 1, 2]) {
      const el = screen.getByTestId(`grid-btn-${i}`)
      expect(el).toHaveAttribute('type', 'button')
      expect(el.tagName).toBe('BUTTON')
    }
  })

  it('marks only the current square aria-current=step', () => {
    squares(1)
    expect(screen.getByTestId('grid-btn-1')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByTestId('grid-btn-0')).not.toHaveAttribute('aria-current')
  })

  it('has the standard focus ring and no press shift or text selection', () => {
    squares()
    const tokens = screen.getByTestId('grid-btn-0').className.split(/\s+/)
    expect(tokens).toContain('focus-visible:outline-focus')
    expect(tokens).toContain('focus-visible:-outline-offset-focus')
    expect(tokens).not.toContain('focus-visible:outline-offset-focus')
    expect(tokens).toContain('select-none')
    expect(tokens).not.toContain('active:translate-y-px')
  })
})
