import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExplanationTab } from './explanation-tab'

describe('ExplanationTab', () => {
  it('shows placeholder when question has not been answered', () => {
    render(<ExplanationTab hasAnswered={false} />)
    expect(screen.getByText('Answer this question to see the explanation.')).toBeInTheDocument()
  })

  it('shows correct message when answer is correct', () => {
    render(
      <ExplanationTab
        hasAnswered={true}
        explanationText="This is the explanation."
        explanationImageUrl={null}
        isCorrect={true}
      />,
    )
    expect(screen.getByText('You answered correctly.')).toBeInTheDocument()
    expect(screen.getByText('This is the explanation.')).toBeInTheDocument()
  })

  it('shows incorrect message when answer is wrong', () => {
    render(
      <ExplanationTab
        hasAnswered={true}
        explanationText={null}
        explanationImageUrl={null}
        isCorrect={false}
      />,
    )
    expect(screen.getByText('You answered incorrectly.')).toBeInTheDocument()
    expect(screen.getByText('No explanation available for this question.')).toBeInTheDocument()
  })

  it('renders explanation image when provided', () => {
    render(
      <ExplanationTab
        hasAnswered={true}
        explanationText="Some text"
        explanationImageUrl="https://example.com/img.png"
        isCorrect={true}
      />,
    )
    expect(screen.getByAltText('Explanation illustration')).toBeInTheDocument()
  })
})
