import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionFilterValue } from '../types'

// ---- Mocks ----------------------------------------------------------------

const { mockUseQuizConfig } = vi.hoisted(() => ({
  mockUseQuizConfig: vi.fn(),
}))

vi.mock('../_hooks/use-quiz-config', () => ({
  useQuizConfig: () => mockUseQuizConfig(),
}))

// Sub-components are rendered by the real component — mock them with
// lightweight stand-ins so tests stay focused on the form's orchestration.
vi.mock('./subject-select', () => ({
  SubjectSelect: ({
    value,
    onValueChange,
  }: {
    value: string
    onValueChange: (v: string) => void
  }) => (
    <button
      type="button"
      data-testid="subject-select"
      data-value={value}
      onClick={() => onValueChange('sub-1')}
    >
      SubjectSelect
    </button>
  ),
}))

vi.mock('./mode-toggle', () => ({
  ModeToggle: () => <div data-testid="mode-toggle">ModeToggle</div>,
}))

vi.mock('./question-filters', () => ({
  QuestionFilters: () => <div data-testid="question-filters">QuestionFilters</div>,
}))

vi.mock('./question-count', () => ({
  QuestionCount: () => <div data-testid="question-count">QuestionCount</div>,
}))

vi.mock('./topic-tree', () => ({
  TopicTree: () => <div data-testid="topic-tree">TopicTree</div>,
}))

// ---- Subject under test ---------------------------------------------------

import { QuizConfigForm } from './quiz-config-form'

// ---- Fixtures -------------------------------------------------------------

const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
]

function makeDefaultConfig(overrides: Partial<ReturnType<typeof buildDefaultConfig>> = {}) {
  return { ...buildDefaultConfig(), ...overrides }
}

type TopicItem = {
  id: string
  code: string
  name: string
  questionCount: number
  subtopics: { id: string; code: string; name: string; questionCount: number }[]
}

function buildDefaultConfig() {
  return {
    subjectId: '',
    mode: 'study' as const,
    setMode: vi.fn(),
    filters: ['all'] as QuestionFilterValue[],
    setFilters: vi.fn(),
    count: 10,
    setCount: vi.fn(),
    availableCount: 100,
    topicTree: {
      topics: [] as TopicItem[],
      checkedTopics: new Set<string>(),
      checkedSubtopics: new Set<string>(),
      allSelected: false,
      isPending: false,
      totalQuestions: 0,
      selectedQuestionCount: 0,
      toggleTopic: vi.fn(),
      toggleSubtopic: vi.fn(),
      selectAll: vi.fn(),
    },
    loading: false,
    error: null as string | null,
    isPending: false,
    handleSubjectChange: vi.fn(),
    handleStart: vi.fn(),
  }
}

// ---- Tests ----------------------------------------------------------------

describe('QuizConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseQuizConfig.mockReturnValue(buildDefaultConfig())
  })

  it('renders without crashing', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByTestId('subject-select')).toBeInTheDocument()
  })

  it('renders SubjectSelect and ModeToggle regardless of subject selection', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByTestId('subject-select')).toBeInTheDocument()
    expect(screen.getByTestId('mode-toggle')).toBeInTheDocument()
  })

  it('hides QuestionFilters and QuestionCount when no subject is selected', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.queryByTestId('question-filters')).not.toBeInTheDocument()
    expect(screen.queryByTestId('question-count')).not.toBeInTheDocument()
  })

  it('shows QuestionFilters and QuestionCount when a subject is selected', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1' }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByTestId('question-filters')).toBeInTheDocument()
    expect(screen.getByTestId('question-count')).toBeInTheDocument()
  })

  it('hides TopicTree when topics array is empty', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1' }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.queryByTestId('topic-tree')).not.toBeInTheDocument()
  })

  it('shows TopicTree when topics are loaded', () => {
    mockUseQuizConfig.mockReturnValue(
      makeDefaultConfig({
        subjectId: 'sub-1',
        topicTree: {
          topics: [
            { id: 't1', code: '050-01', name: 'The Atmosphere', subtopics: [], questionCount: 10 },
          ],
          checkedTopics: new Set<string>(),
          checkedSubtopics: new Set<string>(),
          allSelected: false,
          isPending: false,
          totalQuestions: 10,
          selectedQuestionCount: 10,
          toggleTopic: vi.fn(),
          toggleSubtopic: vi.fn(),
          selectAll: vi.fn(),
        },
      }),
    )
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByTestId('topic-tree')).toBeInTheDocument()
  })

  it('disables Start Quiz button when no subject is selected', () => {
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeDisabled()
  })

  it('enables Start Quiz button when a subject is selected and not loading', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1' }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).not.toBeDisabled()
  })

  it('shows "Starting..." text and disables button while loading', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1', loading: true }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByRole('button', { name: 'Starting...' })).toBeDisabled()
  })

  it('shows error message when the hook reports an error', () => {
    mockUseQuizConfig.mockReturnValue(
      makeDefaultConfig({ subjectId: 'sub-1', error: 'Not enough questions' }),
    )
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByText('Not enough questions')).toBeInTheDocument()
  })

  it('does not show error section when error is null', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1', error: null }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('calls handleStart when Start Quiz button is clicked', async () => {
    const handleStart = vi.fn()
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1', handleStart }))
    const user = userEvent.setup()
    render(<QuizConfigForm subjects={SUBJECTS} />)
    await user.click(screen.getByRole('button', { name: 'Start Quiz' }))
    expect(handleStart).toHaveBeenCalledOnce()
  })

  it('disables Start Quiz button while a transition is pending', () => {
    mockUseQuizConfig.mockReturnValue(makeDefaultConfig({ subjectId: 'sub-1', isPending: true }))
    render(<QuizConfigForm subjects={SUBJECTS} />)
    expect(screen.getByRole('button', { name: 'Start Quiz' })).toBeDisabled()
  })
})
