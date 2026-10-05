import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/app/app/_components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../../_components/exam-countdown-timer', () => ({ ExamCountdownTimer: () => null }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./exam-session-header', () => ({ ExamBadge: () => null }))
vi.mock('./keyboard-legend', () => ({ KeyboardLegend: () => null }))

import { QuizSessionHeader } from './quiz-session-header'
import { QuizSessionMetaRow } from './quiz-session-meta-row'

describe('untimed quiz clock', () => {
  it('header starts from the active time already spent', () => {
    render(
      <QuizSessionHeader
        isExam={false}
        currentIndex={0}
        totalQuestions={5}
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

  it('meta row starts from the active time already spent', () => {
    render(
      <QuizSessionMetaRow
        isExam={false}
        currentIndex={0}
        totalQuestions={5}
        questionNumber={null}
        timerStart={1}
        onTimeExpired={vi.fn()}
        initialActiveMs={61_000}
      />,
    )

    expect(screen.getByText('01:01')).toBeInTheDocument()
  })

  it('starts from zero for a quiz with no saved time', () => {
    render(
      <QuizSessionMetaRow
        isExam={false}
        currentIndex={0}
        totalQuestions={5}
        questionNumber={null}
        timerStart={1}
        onTimeExpired={vi.fn()}
      />,
    )

    expect(screen.getByText('00:00')).toBeInTheDocument()
  })
})
