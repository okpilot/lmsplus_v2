import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QuestionCard } from './question-card'

describe('QuestionCard', () => {
  it('renders question number and total', () => {
    render(
      <QuestionCard
        questionText="What is lift?"
        questionImageUrl={null}
        questionNumber={3}
        totalQuestions={10}
      />,
    )
    expect(screen.getByText('Question 3 of 10')).toBeInTheDocument()
  })

  it('renders the question text', () => {
    render(
      <QuestionCard
        questionText="What is lift?"
        questionImageUrl={null}
        questionNumber={1}
        totalQuestions={5}
      />,
    )
    expect(screen.getByText('What is lift?')).toBeInTheDocument()
  })

  it('renders an image when questionImageUrl is provided', () => {
    render(
      <QuestionCard
        questionText="Identify this instrument"
        questionImageUrl="https://example.com/img.png"
        questionNumber={1}
        totalQuestions={5}
      />,
    )
    // The image opens in a new tab (#863): it's wrapped in a link whose
    // aria-label is the accessible name; the img itself is presentational.
    const link = screen.getByRole('link', { name: 'Open image in new tab: Question illustration' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://example.com/img.png')
  })

  it('does not render an image when questionImageUrl is null', () => {
    render(
      <QuestionCard
        questionText="What is lift?"
        questionImageUrl={null}
        questionNumber={1}
        totalQuestions={5}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('displays DB question number when provided', () => {
    render(
      <QuestionCard
        questionText="What is lift?"
        questionImageUrl={null}
        questionNumber={1}
        totalQuestions={5}
        dbQuestionNumber="050-01-01-001"
      />,
    )
    expect(screen.getByText('050-01-01-001')).toBeInTheDocument()
  })

  it('does not display DB question number when null', () => {
    render(
      <QuestionCard
        questionText="What is lift?"
        questionImageUrl={null}
        questionNumber={1}
        totalQuestions={5}
      />,
    )
    expect(screen.queryByText(/\d{3}-\d{2}-\d{2}-\d{3}/)).not.toBeInTheDocument()
  })
})
