import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('../../actions/end-discovery', () => ({ endDiscovery: vi.fn() }))
vi.mock('@/app/app/_components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../../_components/exam-countdown-timer', () => ({ ExamCountdownTimer: () => null }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./keyboard-legend', () => ({ KeyboardLegend: () => null }))

import { QuizSessionHeader } from './quiz-session-header'

const props = (timerStart: number) => ({
  isExam: false,
  submitting: false,
  timerStart,
  activeTab: 'question' as const,
  onTabChange: vi.fn(),
  onTimeExpired: vi.fn(),
  onFinishClick: vi.fn(),
})

describe('QuizSessionHeader reload', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows the elapsed time derived from the server started_at after a reload', () => {
    const startedAt = Date.now() - 52_000
    const first = render(<QuizSessionHeader {...props(startedAt)} />)
    expect(screen.getByText('00:52')).toBeInTheDocument()
    first.unmount()
    act(() => {
      vi.advanceTimersByTime(8000)
    })
    render(<QuizSessionHeader {...props(startedAt)} />)
    expect(screen.getByText('01:00')).toBeInTheDocument()
  })
})
