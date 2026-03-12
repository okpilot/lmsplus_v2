import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ExplanationTab } from './explanation-tab'

describe('ExplanationTab', () => {
  it('shows correct message when answer is correct', () => {
    render(
      <ExplanationTab
        explanationText="This is the explanation."
        explanationImageUrl={null}
        isCorrect={true}
        correctOptionId="opt-1"
      />,
    )
    expect(screen.getByText('You answered correctly.')).toBeInTheDocument()
    expect(screen.getByText('This is the explanation.')).toBeInTheDocument()
  })

  it('shows incorrect message when answer is wrong', () => {
    render(
      <ExplanationTab
        explanationText={null}
        explanationImageUrl={null}
        isCorrect={false}
        correctOptionId="opt-2"
      />,
    )
    expect(screen.getByText('You answered incorrectly.')).toBeInTheDocument()
    expect(screen.getByText('No explanation available for this question.')).toBeInTheDocument()
  })

  it('renders explanation image when provided', () => {
    render(
      <ExplanationTab
        explanationText="Some text"
        explanationImageUrl="https://example.com/img.png"
        isCorrect={true}
        correctOptionId="opt-1"
      />,
    )
    expect(screen.getByAltText('Explanation illustration')).toBeInTheDocument()
  })
})
