import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/app/app/_components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../../_components/exam-countdown-timer', () => ({ ExamCountdownTimer: () => null }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./keyboard-legend', () => ({ KeyboardLegend: () => null }))

import { QuizSessionHeader } from './quiz-session-header'

describe('untimed quiz clock', () => {
  it('header counts from the session start time', () => {
    render(
      <QuizSessionHeader
        isExam={false}
        submitting={false}
        timerStart={Date.now() - 185_000}
        activeTab="question"
        onTabChange={vi.fn()}
        onTimeExpired={vi.fn()}
        onFinishClick={vi.fn()}
      />,
    )

    expect(screen.getByText('03:05')).toBeInTheDocument()
  })

  it('header starts from zero for a session that just started', () => {
    render(
      <QuizSessionHeader
        isExam={false}
        submitting={false}
        timerStart={Date.now()}
        activeTab="question"
        onTabChange={vi.fn()}
        onTimeExpired={vi.fn()}
        onFinishClick={vi.fn()}
      />,
    )

    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})
