import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./resume-exam-banner', () => ({
  ResumeExamBanner: (p: {
    exam?: { sessionId: string }
    sessionId?: string
    discardOnly?: boolean
  }) => (
    <div data-testid={p.discardOnly ? 'orphan' : 'resume'}>{p.exam?.sessionId ?? p.sessionId}</div>
  ),
}))
vi.mock('./expired-exam-notice', () => ({
  ExpiredExamNotice: (p: { sessionId: string }) => <div data-testid="expired">{p.sessionId}</div>,
}))
vi.mock('./active-practice-banner', () => ({
  ActivePracticeBanner: (p: { session: { sessionId: string } }) => (
    <div data-testid="practice">{p.session.sessionId}</div>
  ),
}))

import type { ActiveExamSession } from '../actions/get-active-exam-session'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { QuizPageBanners } from './quiz-page-banners'

const exam = { sessionId: 'exam-1' } as ActiveExamSession
const practice = { sessionId: 'prac-1' } as ActivePracticeSession

describe('QuizPageBanners', () => {
  it('renders nothing when no session is left open', () => {
    const { container } = render(
      <QuizPageBanners
        userId="u"
        activeExams={[]}
        orphanedIds={[]}
        expiredIds={[]}
        activePractice={null}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one banner per open exam, orphan, expired id and the practice session', () => {
    render(
      <QuizPageBanners
        userId="u"
        activeExams={[exam, { sessionId: 'exam-2' } as ActiveExamSession]}
        orphanedIds={['orph-1']}
        expiredIds={['exp-1', 'exp-2']}
        activePractice={practice}
      />,
    )
    expect(screen.getAllByTestId('resume').map((e) => e.textContent)).toEqual(['exam-1', 'exam-2'])
    expect(screen.getByTestId('orphan')).toHaveTextContent('orph-1')
    expect(screen.getAllByTestId('expired')).toHaveLength(2)
    expect(screen.getByTestId('practice')).toHaveTextContent('prac-1')
  })
})
