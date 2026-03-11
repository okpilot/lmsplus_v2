import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizConfigForm } from './quiz-config-form'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockStartQuizSession = vi.fn()
vi.mock('../actions', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
  { id: 'sub-2', code: '010', name: 'Air Law', short: 'ALW', questionCount: 15 },
]

describe('QuizConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders subject select and question count input', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
    expect(screen.getByLabelText('Number of questions')).toBeInTheDocument()
  })

  it('renders all subject options', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByText(/Meteorology/)).toBeInTheDocument()
    expect(screen.getByText(/Air Law/)).toBeInTheDocument()
  })

  it('disables Start Quiz button when no subject is selected', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeDisabled()
  })

  it('enables Start Quiz button after selecting a subject', async () => {
    const user = userEvent.setup()
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    expect(screen.getByRole('button', { name: 'Start Quiz' })).not.toBeDisabled()
  })

  it('shows available question count after subject selection', async () => {
    const user = userEvent.setup()
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    expect(screen.getByText(/up to 30 available/i)).toBeInTheDocument()
  })

  it('caps available count at 50', async () => {
    const user = userEvent.setup()
    const bigSubject = [
      { id: 'sub-3', code: '070', name: 'Flight Planning', short: 'FPL', questionCount: 100 },
    ]
    render(<QuizConfigForm subjects={bigSubject} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-3')
    expect(screen.getByText(/up to 50 available/i)).toBeInTheDocument()
  })

  it('navigates to session page on successful start', async () => {
    const user = userEvent.setup()
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1', 'q2'],
    })

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    expect(mockStartQuizSession).toHaveBeenCalledWith({
      subjectId: 'sub-1',
      topicId: null,
      count: 10,
    })
    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('shows error message on failure', async () => {
    const user = userEvent.setup()
    mockStartQuizSession.mockResolvedValue({ success: false, error: 'Not enough questions' })

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    expect(screen.getByText('Not enough questions')).toBeInTheDocument()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('stores session data in sessionStorage on success', async () => {
    const user = userEvent.setup()
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1'],
    })

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'quiz-session',
      JSON.stringify({ sessionId: 'sess-1', questionIds: ['q1'] }),
    )
  })
})
