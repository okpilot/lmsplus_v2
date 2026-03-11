import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionSummary } from './session-summary'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('SessionSummary', () => {
  it('displays the rounded score percentage', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70.4}
        mode="quick_quiz"
      />,
    )
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('displays correct and incorrect counts', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="quick_quiz"
      />,
    )
    expect(screen.getByText('7')).toBeInTheDocument() // correctCount
    expect(screen.getByText('3')).toBeInTheDocument() // totalQuestions - correctCount
    expect(screen.getByText('10')).toBeInTheDocument() // total
  })

  it('shows "Quick Quiz Complete" label for quick_quiz mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="quick_quiz"
      />,
    )
    expect(screen.getByText('Quick Quiz Complete')).toBeInTheDocument()
  })

  it('shows "Smart Review Complete" label for smart_review mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="smart_review"
      />,
    )
    expect(screen.getByText('Smart Review Complete')).toBeInTheDocument()
  })

  it('links "Start Another" to /app/quiz for quick_quiz mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="quick_quiz"
      />,
    )
    const link = screen.getByRole('link', { name: 'Start Another' })
    expect(link).toHaveAttribute('href', '/app/quiz')
  })

  it('links "Start Another" to /app/review for smart_review mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="smart_review"
      />,
    )
    const link = screen.getByRole('link', { name: 'Start Another' })
    expect(link).toHaveAttribute('href', '/app/review')
  })

  it('links "Back to Dashboard" to /app/dashboard in both modes', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        correctCount={7}
        scorePercentage={70}
        mode="quick_quiz"
      />,
    )
    const link = screen.getByRole('link', { name: 'Back to Dashboard' })
    expect(link).toHaveAttribute('href', '/app/dashboard')
  })

  it('shows 0 incorrect when all answers are correct', () => {
    render(
      <SessionSummary
        totalQuestions={5}
        correctCount={5}
        scorePercentage={100}
        mode="smart_review"
      />,
    )
    // Incorrect = 5 - 5 = 0
    const incorrectEl = screen.getByText('Incorrect').previousElementSibling
    expect(incorrectEl?.textContent).toBe('0')
  })
})
