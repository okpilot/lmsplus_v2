import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuizSessionLayout } from './quiz-session-layout'

describe('QuizSessionLayout', () => {
  it('puts the question column before the navigator panel in DOM order', () => {
    render(
      <QuizSessionLayout
        tabs={<div data-testid="tabs" />}
        question={<button type="button">answer</button>}
        panel={<button type="button">square</button>}
      />,
    )
    const answer = screen.getByRole('button', { name: 'answer' })
    const square = screen.getByRole('button', { name: 'square' })
    expect(answer.compareDocumentPosition(square) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId('tabs').compareDocumentPosition(answer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('renders the panel in an aside that stacks first below lg', () => {
    render(<QuizSessionLayout question={<p>q</p>} panel={<p>grid</p>} />)
    const aside = screen.getByRole('complementary', { name: 'Question navigator' })
    expect(aside).toHaveClass('order-first', 'lg:order-none', 'lg:sticky')
    expect(aside).toContainElement(screen.getByText('grid'))
  })
})
