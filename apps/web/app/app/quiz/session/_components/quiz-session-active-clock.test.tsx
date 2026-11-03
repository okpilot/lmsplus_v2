import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/app/app/_components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../../_components/exam-countdown-timer', () => ({ ExamCountdownTimer: () => null }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./keyboard-legend', () => ({ KeyboardLegend: () => null }))

import { QuizSessionHeader } from './quiz-session-header'

describe('untimed quiz clock', () => {
  it('header starts from the active time already spent', () => {
    render(
      <QuizSessionHeader
        isExam={false}
        submitting={false}
        timerStart={1}
        activeTab="question"
        onTabChange={vi.fn()}
        onTimeExpired={vi.fn()}
        onFinishClick={vi.fn()}
        initialActiveMs={185_000}
      />,
    )

    expect(screen.getByText('03:05')).toBeInTheDocument()
  })

  it('header starts from zero for a quiz with no saved time', () => {
    render(
      <QuizSessionHeader
        isExam={false}
        submitting={false}
        timerStart={1}
        activeTab="question"
        onTabChange={vi.fn()}
        onTimeExpired={vi.fn()}
        onFinishClick={vi.fn()}
      />,
    )

    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})
