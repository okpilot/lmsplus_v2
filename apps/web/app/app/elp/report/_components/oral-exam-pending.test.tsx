import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

  it('links back to the practice entry page when scoring failed', () => {
    render(<OralExamPending state="failed" sessionId="sess-1" />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app/elp')
  })
})
