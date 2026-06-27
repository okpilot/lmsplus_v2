import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseStudyConfig } = vi.hoisted(() => ({
  mockUseStudyConfig: vi.fn(),
}))

vi.mock('../_hooks/use-study-config', () => ({
  useStudyConfig: (...args: unknown[]) => mockUseStudyConfig(...args),
}))

// Sub-components are mocked with lightweight stand-ins so tests focus on the
// form's orchestration logic, not its children.
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

vi.mock('./question-filters', () => ({
  QuestionFilters: ({ unseenLabel }: { unseenLabel?: string }) => (
    <div data-testid="question-filters" data-unseen-label={unseenLabel}>
      QuestionFilters
    </div>
  ),
}))

vi.mock('./question-count', () => ({
  QuestionCount: () => <div data-testid="question-count">QuestionCount</div>,
}))

vi.mock('./topic-tree', () => ({
  TopicTree: () => <div data-testid="topic-tree">TopicTree</div>,
}))

// ---- Subject under test ---------------------------------------------------

import { StudyConfigForm } from './study-config-form'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = 'user-1'
const SUBJECTS = [
  { id: 'sub-1', code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
]

type TopicItem = {
  id: string
  code: string
  name: string
  questionCount: number
  subtopics: { id: string; code: string; name: string; questionCount: number }[]
}

function buildDefaultTopicTree() {
  return {
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
    reset: vi.fn(),
    loadTopics: vi.fn(),
    getSelectedTopicIds: vi.fn().mockReturnValue([]),
    getSelectedSubtopicIds: vi.fn().mockReturnValue([]),
  }
}

function buildDefaultConfig(overrides: Record<string, unknown> = {}) {
  return {
    subjectId: '',
    filters: ['all'],
    setFilters: vi.fn(),
    calcMode: 'all',
    setCalcMode: vi.fn(),
    imageMode: 'all',
    setImageMode: vi.fn(),
    count: 10,
    setCount: vi.fn(),
    availableCount: 100,
    topicTree: buildDefaultTopicTree(),
    filteredByTopic: null as Record<string, number> | null,
    filteredBySubtopic: null as Record<string, number> | null,
    authError: false,
    isPending: false,
    handleSubjectChange: vi.fn(),
    loading: false,
    error: null as string | null,
    handleStart: vi.fn(),
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('StudyConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseStudyConfig.mockReturnValue(buildDefaultConfig())
  })

  // ---- Hook wiring ---------------------------------------------------------

  describe('hook wiring', () => {
    it('forwards userId and subjects into useStudyConfig', () => {
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(mockUseStudyConfig).toHaveBeenCalledWith({ userId: USER_ID, subjects: SUBJECTS })
    })

    it('renders the config form and never an inline runner', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
      expect(screen.queryByTestId('study-runner')).not.toBeInTheDocument()
    })
  })

  // ---- Start discovery button ----------------------------------------------

  describe('Start discovery button', () => {
    it('is disabled when no subject is selected', () => {
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start discovery' })).toBeDisabled()
    })

    it('is enabled when a subject is selected and no blocking conditions apply', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start discovery' })).not.toBeDisabled()
    })

    it('is disabled when availableCount is zero even with a subject selected', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', availableCount: 0 }),
      )
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start discovery' })).toBeDisabled()
    })

    it('shows Loading text, marks aria-busy, and disables the button while loading', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1', loading: true }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      const btn = screen.getByRole('button', { name: 'Loading...' })
      expect(btn).toBeDisabled()
      expect(btn).toHaveAttribute('aria-busy', 'true')
    })

    it('is disabled while a hook transition is pending', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', isPending: true }),
      )
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start discovery' })).toBeDisabled()
    })

    it('invokes the navigating start handler when the button is clicked', async () => {
      const handleStart = vi.fn()
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1', handleStart }))
      const user = userEvent.setup()
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      await user.click(screen.getByRole('button', { name: 'Start discovery' }))
      expect(handleStart).toHaveBeenCalledOnce()
    })
  })

  // ---- Error states --------------------------------------------------------

  describe('error states', () => {
    it('shows an error alert when the start action reports an error', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ error: 'No matching questions' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('alert')).toHaveTextContent('No matching questions')
    })

    it('shows a session-expired alert and disables the button when authError is true', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', authError: true }),
      )
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Session expired. Please refresh the page.',
      )
      expect(screen.getByRole('button', { name: 'Start discovery' })).toBeDisabled()
    })

    it('shows no alert and renders form content when there are no errors', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
    })
  })

  // ---- Conditional sub-component rendering ---------------------------------

  describe('conditional sub-component rendering', () => {
    it('hides filter controls and question count when no subject is selected', () => {
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.queryByTestId('question-filters')).not.toBeInTheDocument()
      expect(screen.queryByTestId('question-count')).not.toBeInTheDocument()
    })

    it('shows filter controls and question count once a subject is selected', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByTestId('question-filters')).toBeInTheDocument()
      expect(screen.getByTestId('question-count')).toBeInTheDocument()
    })

    it('shows the caller-provided label on the unseen filter', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} unseenLabel="Unseen" />)
      expect(screen.getByTestId('question-filters')).toHaveAttribute('data-unseen-label', 'Unseen')
    })

    it('shows topic selection only when topics are available', () => {
      const topicTree = buildDefaultTopicTree()
      topicTree.topics = [
        { id: 't1', code: '050-01', name: 'The Atmosphere', questionCount: 10, subtopics: [] },
      ]
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1', topicTree }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.getByTestId('topic-tree')).toBeInTheDocument()
    })

    it('hides topic selection when no topics are available', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm userId={USER_ID} subjects={SUBJECTS} />)
      expect(screen.queryByTestId('topic-tree')).not.toBeInTheDocument()
    })
  })
})
