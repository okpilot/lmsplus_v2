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
        answeredCount={10}
        correctCount={7}
        scorePercentage={70.4}
      />,
    )
    expect(screen.getByText('70%')).toBeInTheDocument()
  })

  it('displays correct and incorrect counts based on answered (not total)', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    expect(screen.getByText('7')).toBeInTheDocument() // correctCount
    expect(screen.getByText('3')).toBeInTheDocument() // answeredCount - correctCount
    expect(screen.getByText('10')).toBeInTheDocument() // answeredCount
  })

  it('shows "Quiz Complete" label for quick_quiz mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    expect(screen.getByText('Quiz Complete')).toBeInTheDocument()
  })

  it('links "Start Another" to /app/quiz for quick_quiz mode', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    const link = screen.getByRole('link', { name: 'Start Another' })
    expect(link).toHaveAttribute('href', '/app/quiz')
  })

  it('links "Back to Dashboard" to /app/dashboard', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    const link = screen.getByRole('link', { name: 'Back to Dashboard' })
    expect(link).toHaveAttribute('href', '/app/dashboard')
  })

  it('shows 0 incorrect when all answers are correct', () => {
    render(
      <SessionSummary
        totalQuestions={5}
        answeredCount={5}
        correctCount={5}
        scorePercentage={100}
      />,
    )
    const incorrectEl = screen.getByText('Incorrect').previousElementSibling
    expect(incorrectEl?.textContent).toBe('0')
  })

  it('shows skipped count and answered count when questions were skipped', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={8}
        correctCount={6}
        scorePercentage={75}
      />,
    )
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    // skippedCount = 10 - 8 = 2; use label sibling to disambiguate from incorrectCount (also 2)
    const skippedEl = screen.getByText('Skipped').previousElementSibling
    expect(skippedEl?.textContent).toBe('2')
    expect(screen.getByText('8')).toBeInTheDocument() // answeredCount
    expect(screen.getByText('Answered')).toBeInTheDocument()
  })

  it('does not show skipped stat when all questions were answered', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    expect(screen.queryByText('Skipped')).not.toBeInTheDocument()
  })

  it('computes incorrect as answered minus correct, not total minus correct', () => {
    // 10 total, 7 answered, 5 correct → incorrect = 2 (not 5)
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={7}
        correctCount={5}
        scorePercentage={71.4}
      />,
    )
    const incorrectEl = screen.getByText('Incorrect').previousElementSibling
    expect(incorrectEl?.textContent).toBe('2')
  })
})
