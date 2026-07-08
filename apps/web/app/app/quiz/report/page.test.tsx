import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockQuizReportView = vi.hoisted(() => vi.fn())
vi.mock('./report-view', () => ({
  QuizReportView: (props: unknown) => {
    mockQuizReportView(props)
    return <div data-testid="quiz-report-view" />
  },
}))

// ---- Import under test (AFTER mocks) ----------------------------------------

import QuizReportPage from './page'

// ---- Tests ------------------------------------------------------------------

describe('QuizReportPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('delegates to the quiz report view with the resolved session and page', async () => {
    const searchParams = Promise.resolve({ session: 'abc-123', page: '2' })
    const jsx = await QuizReportPage({ searchParams })
    render(jsx)

    expect(screen.getByTestId('quiz-report-view')).toBeInTheDocument()
    expect(mockQuizReportView).toHaveBeenCalledWith({
      sessionId: 'abc-123',
      pageParam: '2',
      namespace: 'quiz',
    })
  })

  it('passes undefined session/page through unchanged', async () => {
    const searchParams = Promise.resolve({})
    const jsx = await QuizReportPage({ searchParams })
    render(jsx)

    expect(mockQuizReportView).toHaveBeenCalledWith({
      sessionId: undefined,
      pageParam: undefined,
      namespace: 'quiz',
    })
  })
})
