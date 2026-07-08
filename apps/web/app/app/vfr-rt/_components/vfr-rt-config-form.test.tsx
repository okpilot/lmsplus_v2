import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseQuizConfig, mockHandleStart, mockSetMode } = vi.hoisted(() => ({
  mockUseQuizConfig: vi.fn(),
  mockHandleStart: vi.fn(),
  mockSetMode: vi.fn(),
}))

vi.mock('@/app/app/quiz/_hooks/use-quiz-config', () => ({
  useQuizConfig: (...args: unknown[]) => mockUseQuizConfig(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { VfrRtConfigForm } from './vfr-rt-config-form'

// ---- Fixtures ---------------------------------------------------------------

const SUBJECT_ID = 'subj-rt'

function buildMockTopicTree(overrides: Record<string, unknown> = {}) {
  return {
    topics: [] as {
      id: string
      code: string
      name: string
      questionCount: number
      subtopics: []
    }[],
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    allSelected: false,
    isPending: false,
    totalQuestions: 0,
    selectedQuestionCount: 0,
    loadTopics: vi.fn(),
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
    reset: vi.fn(),
    getSelectedTopicIds: vi.fn(() => [] as string[]),
    getSelectedSubtopicIds: vi.fn(() => [] as string[]),
    ...overrides,
  }
}

function buildMockConfig(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: SUBJECT_ID,
    mode: 'study',
    setMode: mockSetMode,
    filters: ['all'],
    setFilters: vi.fn(),
    calcMode: 'all',
    setCalcMode: vi.fn(),
    imageMode: 'all',
    setImageMode: vi.fn(),
    count: 10,
    setCount: vi.fn(),
    availableCount: 10,
    topicTree: buildMockTopicTree(),
    filteredByTopic: null,
    filteredBySubtopic: null,
    loading: false,
    error: null,
    authError: false,
    isPending: false,
    handleSubjectChange: vi.fn(),
    handleStart: mockHandleStart,
    ...overrides,
  }
}

// ---- Lifecycle --------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockUseQuizConfig.mockReturnValue(buildMockConfig())
})

// ---- Mode toggle --------------------------------------------------------------

describe('VfrRtConfigForm — mode toggle', () => {
  it('locks the config to the RT subject in study mode', () => {
    // The session handoff derives subjectName/subjectCode from the synthetic subject
    // whose id must equal subjectId — assert that handoff-critical invariant.
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(mockUseQuizConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        initialSubjectId: SUBJECT_ID,
        initialMode: 'study',
        subjects: [expect.objectContaining({ id: SUBJECT_ID })],
      }),
    )
  })

  it('renders Study as the active mode', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /study/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders Discovery disabled', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /discovery/i })).toBeDisabled()
  })

  it('renders Practice Exam disabled', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /practice exam/i })).toBeDisabled()
  })
})

// ---- Filters --------------------------------------------------------------

describe('VfrRtConfigForm — filters', () => {
  it('labels the unseen filter "Unanswered"', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByText('Unanswered')).toBeInTheDocument()
  })
})

// ---- Topics --------------------------------------------------------------

describe('VfrRtConfigForm — topics', () => {
  it('renders topic names without EASA codes', () => {
    mockUseQuizConfig.mockReturnValue(
      buildMockConfig({
        topicTree: buildMockTopicTree({
          topics: [
            { id: 'p1', code: 'P1_ACRONYMS', name: 'Acronyms', questionCount: 5, subtopics: [] },
          ],
          checkedTopics: new Set(['p1']),
          totalQuestions: 5,
          selectedQuestionCount: 5,
          allSelected: true,
        }),
        availableCount: 5,
      }),
    )
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByText('Acronyms')).toBeInTheDocument()
    expect(screen.queryByText(/P1_ACRONYMS/)).not.toBeInTheDocument()
  })

  it('does not render the topic tree or count when no topics are loaded yet', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.queryByText(/questions available/i)).not.toBeInTheDocument()
  })
})

// ---- Start Practice button --------------------------------------------------------------

describe('VfrRtConfigForm — Start Practice button', () => {
  it('is disabled when no questions are available', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ availableCount: 0 }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })

  it('is enabled when questions are available', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ availableCount: 10 }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /start practice/i })).not.toBeDisabled()
  })

  it('is disabled while a start is in progress', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ loading: true }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()
  })

  it('calls config.handleStart when clicked', async () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ availableCount: 10 }))
    const user = userEvent.setup()
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    await user.click(screen.getByRole('button', { name: /start practice/i }))
    expect(mockHandleStart).toHaveBeenCalled()
  })

  it('is disabled while topics or filter counts are loading', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ isPending: true, availableCount: 10 }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })

  it('is disabled when the session has expired', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ authError: true, availableCount: 10 }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })
})

// ---- Error display --------------------------------------------------------------

describe('VfrRtConfigForm — error display', () => {
  it('renders an error alert when session start fails', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ error: 'No questions available' }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No questions available')
  })

  it('renders an auth-error alert when the session has expired', () => {
    mockUseQuizConfig.mockReturnValue(buildMockConfig({ authError: true }))
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i)
  })

  it('does not render an error alert when there is no error', () => {
    render(<VfrRtConfigForm userId="user-1" subjectId={SUBJECT_ID} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
