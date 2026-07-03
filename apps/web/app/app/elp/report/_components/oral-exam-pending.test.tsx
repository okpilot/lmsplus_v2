import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// DiscardAndRestartButton has its own test file — stub it so this test only
// exercises OralExamPending's own state branching.
vi.mock('./discard-and-restart-button', () => ({
  DiscardAndRestartButton: ({ sessionId }: { sessionId: string }) => (
    <button type="button" data-testid="discard-and-restart" data-session-id={sessionId}>
      Start over
    </button>
  ),
}))

import { OralExamPending } from './oral-exam-pending'

describe('OralExamPending', () => {
  it('renders a meta refresh tag and the scoring message while grading', () => {
    render(<OralExamPending state="grading" sessionId="sess-1" />)

    // React 19 hoists <meta> elements to document.head regardless of where they're
    // rendered in the tree, so the tag lives outside the RTL container.
    const meta = document.querySelector('meta[http-equiv="refresh"]')
    expect(meta).not.toBeNull()
    expect(meta).toHaveAttribute('content', '5')
    expect(screen.getByText(/scoring your answer/i)).toBeInTheDocument()
  })

  it('links the manual refresh action back to the current report route', () => {
    render(<OralExamPending state="grading" sessionId="sess-1" />)
    expect(screen.getByRole('link', { name: /refresh now/i })).toHaveAttribute(
      'href',
      '/app/elp/report/sess-1',
    )
  })

  it('does not render a meta refresh tag when scoring failed', () => {
    render(<OralExamPending state="failed" sessionId="sess-1" />)

    expect(document.querySelector('meta[http-equiv="refresh"]')).toBeNull()
    expect(screen.getByText(/scoring failed/i)).toBeInTheDocument()
  })

  it('offers a start-over control scoped to the stuck session when scoring failed', () => {
    render(<OralExamPending state="failed" sessionId="sess-1" />)

    const control = screen.getByTestId('discard-and-restart')
    expect(control.dataset.sessionId).toBe('sess-1')
  })
})
