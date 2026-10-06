import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./resume-exam-banner', () => ({
  ResumeExamBanner: (p: {
    userId: string
    exam?: { sessionId: string }
    sessionId?: string
    discardOnly?: boolean
  }) => (
    <div data-testid={p.discardOnly ? 'orphan-banner' : 'exam-banner'} data-user={p.userId}>
      {p.exam?.sessionId ?? p.sessionId}
    </div>
  ),
}))
vi.mock('./expired-exam-notice', () => ({
  ExpiredExamNotice: (p: { sessionId: string }) => <div data-testid="expired">{p.sessionId}</div>,
}))
vi.mock('./active-practice-banner', () => ({
  ActivePracticeBanner: (p: { userId: string }) => (
    <div data-testid="practice" data-user={p.userId} />
  ),
}))

import { QuizPageBanners } from './quiz-page-banners'

type Props = Parameters<typeof QuizPageBanners>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    userId: 'u1',
    activeExams: [],
    orphanedIds: [],
    expiredIds: [],
    activePractice: null,
    ...over,
  } as Props
}

describe('QuizPageBanners', () => {
  it('renders a resume banner per active exam for the user', () => {
    render(
      <QuizPageBanners
        {...props({
          activeExams: [{ sessionId: 'e1' }, { sessionId: 'e2' }] as Props['activeExams'],
        })}
      />,
    )
    const banners = screen.getAllByTestId('exam-banner')
    expect(banners.map((b) => b.textContent)).toEqual(['e1', 'e2'])
    expect(banners[0]?.getAttribute('data-user')).toBe('u1')
  })

  it('renders a discard-only banner per orphaned session', () => {
    render(<QuizPageBanners {...props({ orphanedIds: ['o1'] })} />)
    const banner = screen.getByTestId('orphan-banner')
    expect(banner.textContent).toBe('o1')
    expect(banner.getAttribute('data-user')).toBe('u1')
  })

  it('renders an expired notice per expired session', () => {
    render(<QuizPageBanners {...props({ expiredIds: ['x1', 'x2'] })} />)
    expect(screen.getAllByTestId('expired').map((n) => n.textContent)).toEqual(['x1', 'x2'])
  })

  it('renders the practice banner for the user when a practice session is active', () => {
    render(
      <QuizPageBanners
        {...props({ activePractice: { sessionId: 'p1' } as Props['activePractice'] })}
      />,
    )
    expect(screen.getByTestId('practice').getAttribute('data-user')).toBe('u1')
  })

  it('renders no practice banner when no practice session is active', () => {
    render(<QuizPageBanners {...props()} />)
    expect(screen.queryByTestId('practice')).toBeNull()
  })
})
