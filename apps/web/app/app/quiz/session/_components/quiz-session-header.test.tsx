import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  beforeEach(() => {
    vi.resetAllMocks()
    mockEndDiscovery.mockResolvedValue({ success: true })
  })

  it('ends the discovery session before navigating back to the quiz picker', async () => {
    render(<QuizSessionHeader {...baseProps} isDiscovery />)
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/app/quiz'))
    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    // Teardown must run before the terminal navigation (code-style.md §6).
    // safe: the waitFor + toHaveBeenCalledTimes(1) above confirm both mocks fired.
    expect(mockEndDiscovery.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0]!,
    )
  })

  it('navigates back even when the discovery teardown rejects', async () => {
    mockEndDiscovery.mockRejectedValue(new Error('network'))
    render(<QuizSessionHeader {...baseProps} isDiscovery />)
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }))

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/app/quiz'))
  })

  it('renders the Finish button (not Exit) and does not end discovery for a normal session', () => {
    render(<QuizSessionHeader {...baseProps} isDiscovery={false} />)
    expect(screen.getByRole('button', { name: /Finish Test/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Exit' })).not.toBeInTheDocument()
    expect(mockEndDiscovery).not.toHaveBeenCalled()
  })
})
