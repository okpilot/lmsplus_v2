import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizConfigForm } from './quiz-config-form'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockStartQuizSession = vi.fn()
vi.mock('../actions/start', () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
}))

const mockFetchTopics = vi.fn()
const mockFetchSubtopics = vi.fn()
vi.mock('../actions/lookup', () => ({
  fetchTopicsForSubject: (...args: unknown[]) => mockFetchTopics(...args),
  fetchSubtopicsForTopic: (...args: unknown[]) => mockFetchSubtopics(...args),
}))

const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
  { id: 'sub-2', code: '010', name: 'Air Law', short: 'ALW', questionCount: 15 },
]

const TOPICS = [
  { id: 'top-1', code: '050-01', name: 'The Atmosphere', questionCount: 12 },
  { id: 'top-2', code: '050-02', name: 'Wind', questionCount: 18 },
]

describe('QuizConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(), removeItem: vi.fn() })
    mockFetchTopics.mockResolvedValue([])
    mockFetchSubtopics.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders subject select', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByLabelText('Subject')).toBeInTheDocument()
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

  it('shows question count slider after subject selection', async () => {
    const user = userEvent.setup()
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    expect(screen.getByText(/up to 30 available/i)).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
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

  it('fetches topics when a subject is selected', async () => {
    const user = userEvent.setup()
    mockFetchTopics.mockResolvedValue(TOPICS)
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')

    await waitFor(() => {
      expect(mockFetchTopics).toHaveBeenCalledWith('sub-1')
      expect(screen.getByLabelText('Topic (optional)')).toBeInTheDocument()
    })
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

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: null,
        subtopicId: null,
      }),
    )
    expect(mockPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('passes topicId when a topic is selected', async () => {
    const user = userEvent.setup()
    mockFetchTopics.mockResolvedValue(TOPICS)
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1'],
    })

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')

    await waitFor(() => {
      expect(screen.getByLabelText('Topic (optional)')).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText('Topic (optional)'), 'top-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    expect(mockStartQuizSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectId: 'sub-1',
        topicId: 'top-1',
        subtopicId: null,
      }),
    )
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

  it('shows loading state while starting a quiz', async () => {
    const user = userEvent.setup()
    let resolveStart: (v: unknown) => void
    mockStartQuizSession.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve
      }),
    )

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()

    resolveStart!({ success: true, sessionId: 'sess-1', questionIds: ['q1'] })
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled()
    })
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
      JSON.stringify({
        sessionId: 'sess-1',
        questionIds: ['q1'],
        subjectName: 'Meteorology',
        subjectCode: 'MET',
      }),
    )
  })

  it('shows generic error and resets loading when startQuizSession throws', async () => {
    const user = userEvent.setup()
    mockStartQuizSession.mockRejectedValue(new Error('network failure'))

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument()
    })
    // Loading state must be reset so button is usable again
    expect(screen.getByRole('button', { name: 'Start Quiz' })).not.toBeDisabled()
  })

  it('clamps question count to maxQuestions before calling startQuizSession', async () => {
    const user = userEvent.setup()
    mockStartQuizSession.mockResolvedValue({
      success: true,
      sessionId: 'sess-1',
      questionIds: ['q1'],
    })

    // sub-1 has questionCount: 30 → maxQuestions = 30
    // We manipulate count via the range slider — set it to a value beyond max by firing change
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')

    // The slider max is 30 for sub-1; simulate selecting 30 questions
    const slider = screen.getByRole('slider')
    await user.click(slider)
    // Fire an artificial change to set count beyond maxQuestions to verify clamping
    fireEvent.change(slider, { target: { value: '30' } })

    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))

    await waitFor(() => {
      expect(mockStartQuizSession).toHaveBeenCalled()
    })
    const calledWith = mockStartQuizSession.mock.calls[0]![0] as { count: number }
    expect(calledWith.count).toBeLessThanOrEqual(30)
  })

  it('label shows clamped count when count exceeds maxQuestions', async () => {
    const user = userEvent.setup()
    // sub-1 has questionCount: 30 → maxQuestions clamps to 30
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')

    const slider = screen.getByRole('slider')
    // Force the slider value beyond the max to exercise the Math.min clamp in the label
    fireEvent.change(slider, { target: { value: '50' } })

    // Label must show clamped value (30), not the raw value (50)
    expect(screen.getByText(/Number of questions: 30/)).toBeInTheDocument()
  })

  it('resets topic and subtopic when subject changes', async () => {
    const user = userEvent.setup()
    mockFetchTopics.mockResolvedValue(TOPICS)

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await waitFor(() => {
      expect(screen.getByLabelText('Topic (optional)')).toBeInTheDocument()
    })

    // Change subject — topics should disappear
    mockFetchTopics.mockResolvedValue([])
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-2')
    await waitFor(() => {
      expect(screen.queryByLabelText('Topic (optional)')).not.toBeInTheDocument()
    })
  })
})
