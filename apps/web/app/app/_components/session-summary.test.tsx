import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionSummary } from './session-summary'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

function tileFor(label: string) {
  return screen.getByText(label).closest('[data-slot="stat"]')
}

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
    expect(tileFor('Incorrect')).toHaveTextContent('0')
  })

  it('sets the count tiles at heading size so a four-column row fits a phone', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={8}
        correctCount={6}
        scorePercentage={75}
      />,
    )
    for (const label of ['Correct', 'Incorrect', 'Skipped', 'Answered']) {
      const value = tileFor(label)?.querySelector('span.tabular-nums')
      expect(value?.className, label).toContain('text-heading')
    }
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
    expect(tileFor('Skipped')).toHaveTextContent('2')
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
    expect(tileFor('Incorrect')).toHaveTextContent('2')
  })

  it('renders the correct and incorrect counts as stat tiles in success and danger tones', () => {
    render(
      <SessionSummary
        totalQuestions={10}
        answeredCount={10}
        correctCount={7}
        scorePercentage={70}
      />,
    )
    expect(tileFor('Correct')?.querySelector('.text-success')).toHaveTextContent('7')
    expect(tileFor('Incorrect')?.querySelector('.text-danger')).toHaveTextContent('3')
  })

  it.each([
    [8, ['grid-cols-2', 'sm:grid-cols-4']],
    [10, ['grid-cols-3']],
  ] as const)(
    'lays the tiles out for the right column count when answered is %i of 10',
    (answeredCount, expected) => {
      render(
        <SessionSummary
          totalQuestions={10}
          answeredCount={answeredCount}
          correctCount={6}
          scorePercentage={60}
        />,
      )
      const grid = tileFor('Correct')?.closest('.grid')
      const tokens = (grid?.className ?? '').split(/\s+/).filter((c) => c.includes('grid-cols'))
      expect(tokens.sort()).toEqual([...expected].sort())
    },
  )
})
