import { render, screen, waitFor } from '@testing-library/react'
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
    })
    await waitFor(() => {
      expect(screen.getByLabelText(/Topic/)).toBeInTheDocument()
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
      expect(screen.getByLabelText(/Topic/)).toBeInTheDocument()
    })
    await user.selectOptions(screen.getByLabelText(/Topic/), 'top-1')
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
      JSON.stringify({ sessionId: 'sess-1', questionIds: ['q1'] }),
    )
  })

  it('resets topic and subtopic when subject changes', async () => {
    const user = userEvent.setup()
    mockFetchTopics.mockResolvedValue(TOPICS)

    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-1')
    await waitFor(() => {
      expect(screen.getByLabelText(/Topic/)).toBeInTheDocument()
    })

    // Change subject — topics should disappear
    mockFetchTopics.mockResolvedValue([])
    await user.selectOptions(screen.getByLabelText('Subject'), 'sub-2')
    await waitFor(() => {
      expect(screen.queryByLabelText(/Topic/)).not.toBeInTheDocument()
    })
  })
})
