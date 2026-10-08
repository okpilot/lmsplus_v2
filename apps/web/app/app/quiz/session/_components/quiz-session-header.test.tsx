import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockReplace, mockEndDiscovery } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockEndDiscovery: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

vi.mock('../../actions/end-discovery', () => ({
  endDiscovery: (...args: unknown[]) => mockEndDiscovery(...args),
}))

// Stub the heavy child components — this suite only exercises the header's own
// Exit/Finish behaviour, not the children.
vi.mock('@/app/app/_components/session-timer', () => ({ SessionTimer: () => null }))
vi.mock('@/app/app/_components/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('../../_components/exam-countdown-timer', () => ({ ExamCountdownTimer: () => null }))
vi.mock('../../_components/question-tabs', () => ({ QuestionTabs: () => null }))
vi.mock('./exam-session-header', () => ({ ExamBadge: () => null }))
vi.mock('./keyboard-legend', () => ({ KeyboardLegend: () => null }))

// ---- Subject under test ----------------------------------------------------

import { QuizSessionHeader } from './quiz-session-header'

// ---- Fixtures --------------------------------------------------------------

const baseProps = {
  isExam: false,
  currentIndex: 0,
  totalQuestions: 5,
  submitting: false,
  timerStart: Date.now(),
  activeTab: 'question' as const,
  onTabChange: vi.fn(),
  onTimeExpired: vi.fn(),
  onFinishClick: vi.fn(),
}

// ---- Tests -----------------------------------------------------------------

describe('QuizSessionHeader — Discovery exit', () => {
  beforeEach(() => vi.resetAllMocks())

  it('asks for confirmation instead of leaving when Exit is clicked', () => {
    const onExitClick = vi.fn()
    render(<QuizSessionHeader {...baseProps} isDiscovery onExitClick={onExitClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))

    expect(onExitClick).toHaveBeenCalledTimes(1)
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockEndDiscovery).not.toHaveBeenCalled()
  })

  it('fires the Finish callback (not the exit confirm) for a normal session', () => {
    const onExitClick = vi.fn()
    render(<QuizSessionHeader {...baseProps} isDiscovery={false} onExitClick={onExitClick} />)
    expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Finish Test/ }))

    expect(baseProps.onFinishClick).toHaveBeenCalledTimes(1)
    expect(onExitClick).not.toHaveBeenCalled()
  })
})
