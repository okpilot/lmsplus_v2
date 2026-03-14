import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetchExplanation } = vi.hoisted(() => ({
  mockFetchExplanation: vi.fn(),
}))

vi.mock('../actions/fetch-explanation', () => ({
  fetchExplanation: mockFetchExplanation,
}))

import { ExplanationTab } from './explanation-tab'

describe('ExplanationTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('fetches and shows explanation before answering', async () => {
    mockFetchExplanation.mockResolvedValue({
      success: true,
      explanationText: 'Pre-answer explanation.',
      explanationImageUrl: null,
    })
    render(<ExplanationTab hasAnswered={false} questionId="q-1" sessionId="s-1" />)
    await waitFor(() => {
      expect(screen.getByText('Pre-answer explanation.')).toBeInTheDocument()
    })
    expect(mockFetchExplanation).toHaveBeenCalledWith({
      questionId: 'q-1',
      sessionId: 's-1',
    })
  })

  it('shows fallback when fetch returns no explanation', async () => {
    mockFetchExplanation.mockResolvedValue({ success: false })
    render(<ExplanationTab hasAnswered={false} questionId="q-1" sessionId="s-1" />)
    await waitFor(() => {
      expect(screen.getByText('No explanation available for this question.')).toBeInTheDocument()
    })
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
