import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FeedbackPanel } from './feedback-panel'

describe('FeedbackPanel', () => {
  it('shows "Correct!" when the answer is correct', () => {
    render(
      <FeedbackPanel
        isCorrect={true}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    expect(screen.getByText('Correct!')).toBeInTheDocument()
  })

  it('shows "Incorrect" when the answer is wrong', () => {
    render(
      <FeedbackPanel
        isCorrect={false}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('renders explanation text when provided', () => {
    render(
      <FeedbackPanel
        isCorrect={true}
        explanationText="VFR minima require 1500 m visibility"
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    expect(screen.getByText('VFR minima require 1500 m visibility')).toBeInTheDocument()
  })

  it('does not render explanation text when it is null', () => {
    render(
      <FeedbackPanel
        isCorrect={true}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    // No paragraph with explanation content
    expect(screen.queryByText(/minima/i)).not.toBeInTheDocument()
  })

  it('renders an explanation image when URL is provided', () => {
    render(
      <FeedbackPanel
        isCorrect={true}
        explanationText={null}
        explanationImageUrl="https://cdn.example.com/explain.png"
        onNext={vi.fn()}
      />,
    )
    const img = screen.getByRole('img', { name: 'Explanation illustration' })
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/explain.png')
  })

  it('does not render an explanation image when URL is null', () => {
    render(
      <FeedbackPanel
        isCorrect={false}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('calls onNext when the Next Question button is clicked', async () => {
    const user = userEvent.setup()
    const onNext = vi.fn()
    render(
      <FeedbackPanel
        isCorrect={true}
        explanationText={null}
        explanationImageUrl={null}
        onNext={onNext}
      />,
    )
    await user.click(screen.getByRole('button', { name: /next question/i }))
    expect(onNext).toHaveBeenCalledOnce()
  })

  it('applies green styling for a correct answer', () => {
    const { container } = render(
      <FeedbackPanel
        isCorrect={true}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    const panel = container.firstChild as HTMLElement
    expect(panel.className).toContain('border-green-500')
  })

  it('applies destructive styling for an incorrect answer', () => {
    const { container } = render(
      <FeedbackPanel
        isCorrect={false}
        explanationText={null}
        explanationImageUrl={null}
        onNext={vi.fn()}
      />,
    )
    const panel = container.firstChild as HTMLElement
    expect(panel.className).toContain('border-destructive')
  })
})
