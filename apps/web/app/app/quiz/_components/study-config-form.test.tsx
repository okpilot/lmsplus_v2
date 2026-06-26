import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUseStudyConfig, mockUseStudyStart } = vi.hoisted(() => ({
  mockUseStudyConfig: vi.fn(),
  mockUseStudyStart: vi.fn(),
}))

vi.mock('../_hooks/use-study-config', () => ({
  useStudyConfig: () => mockUseStudyConfig(),
}))

vi.mock('../_hooks/use-study-start', () => ({
  useStudyStart: () => mockUseStudyStart(),
}))

// StudyRunner: expose the onExit callback via an Exit button so tests can invoke it.
vi.mock('../study/_components/study-runner', () => ({
  StudyRunner: ({ onExit }: { onExit: () => void }) => (
    <div data-testid="study-runner">
      <button type="button" onClick={onExit}>
        Exit
      </button>
    </div>
  ),
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
  QuestionFilters: () => <div data-testid="question-filters">QuestionFilters</div>,
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
    ...overrides,
  }
}

function buildDefaultStudy(overrides: Record<string, unknown> = {}) {
  return {
    questions: null as unknown[] | null,
    loading: false,
    error: null as string | null,
    start: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  }
}

// ---- Tests ----------------------------------------------------------------

describe('StudyConfigForm', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseStudyConfig.mockReturnValue(buildDefaultConfig())
    mockUseStudyStart.mockReturnValue(buildDefaultStudy())
  })

  // ---- Runner vs config form -----------------------------------------------

  describe('runner vs config form conditional rendering', () => {
    it('renders the config form when no questions have been loaded yet', () => {
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
      expect(screen.queryByTestId('study-runner')).not.toBeInTheDocument()
    })

    it('renders StudyRunner and hides the config form when questions are loaded', () => {
      mockUseStudyStart.mockReturnValue(
        buildDefaultStudy({ questions: [{ id: 'q-1', questionText: 'Test?' }] }),
      )
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByTestId('study-runner')).toBeInTheDocument()
      expect(screen.queryByTestId('subject-select')).not.toBeInTheDocument()
    })

    it('calls reset when StudyRunner fires onExit', async () => {
      const reset = vi.fn()
      mockUseStudyStart.mockReturnValue(
        buildDefaultStudy({ questions: [{ id: 'q-1', questionText: 'Test?' }], reset }),
      )
      const user = userEvent.setup()
      render(<StudyConfigForm subjects={SUBJECTS} />)
      await user.click(screen.getByRole('button', { name: 'Exit' }))
      expect(reset).toHaveBeenCalledOnce()
    })
  })

  // ---- Button enabled / disabled -------------------------------------------

  describe('Start studying button', () => {
    it('is disabled when no subject is selected', () => {
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled()
    })

    it('is enabled when a subject is selected and no blocking conditions apply', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start studying' })).not.toBeDisabled()
    })

    it('is disabled when availableCount is zero even with a subject selected', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', availableCount: 0 }),
      )
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled()
    })

    it('shows Loading text, marks aria-busy, and disables the button while loading', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      mockUseStudyStart.mockReturnValue(buildDefaultStudy({ loading: true }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      const btn = screen.getByRole('button', { name: 'Loading...' })
      expect(btn).toBeDisabled()
      expect(btn).toHaveAttribute('aria-busy', 'true')
    })

    it('is disabled while a hook transition is pending', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', isPending: true }),
      )
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled()
    })
  })

  // ---- Error states --------------------------------------------------------

  describe('error states', () => {
    it('shows an error alert when the start action reports an error', () => {
      mockUseStudyStart.mockReturnValue(buildDefaultStudy({ error: 'No matching questions' }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('alert')).toHaveTextContent('No matching questions')
    })

    it('shows a session-expired alert and disables the button when authError is true', () => {
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', authError: true }),
      )
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Session expired. Please refresh the page.',
      )
      expect(screen.getByRole('button', { name: 'Start studying' })).toBeDisabled()
    })

    it('shows no alert and renders form content when there are no errors', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByTestId('subject-select')).toBeInTheDocument()
    })
  })

  // ---- Conditional sub-component rendering ---------------------------------

  describe('conditional sub-component rendering', () => {
    it('hides QuestionFilters and QuestionCount when no subject is selected', () => {
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.queryByTestId('question-filters')).not.toBeInTheDocument()
      expect(screen.queryByTestId('question-count')).not.toBeInTheDocument()
    })

    it('shows QuestionFilters and QuestionCount once a subject is selected', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByTestId('question-filters')).toBeInTheDocument()
      expect(screen.getByTestId('question-count')).toBeInTheDocument()
    })

    it('shows TopicTree only when the topic list is non-empty', () => {
      const topicTree = buildDefaultTopicTree()
      topicTree.topics = [
        { id: 't1', code: '050-01', name: 'The Atmosphere', questionCount: 10, subtopics: [] },
      ]
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1', topicTree }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.getByTestId('topic-tree')).toBeInTheDocument()
    })

    it('hides TopicTree when the topics list is empty', () => {
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      render(<StudyConfigForm subjects={SUBJECTS} />)
      expect(screen.queryByTestId('topic-tree')).not.toBeInTheDocument()
    })
  })

  // ---- handleStart orchestration -------------------------------------------

  describe('handleStart', () => {
    it('clamps count to availableCount when count exceeds the available pool', async () => {
      const start = vi.fn()
      mockUseStudyConfig.mockReturnValue(
        buildDefaultConfig({ subjectId: 'sub-1', count: 50, availableCount: 20 }),
      )
      mockUseStudyStart.mockReturnValue(buildDefaultStudy({ start }))
      const user = userEvent.setup()
      render(<StudyConfigForm subjects={SUBJECTS} />)
      await user.click(screen.getByRole('button', { name: 'Start studying' }))
      expect(start).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }))
    })

    it('passes undefined for topicIds and subtopicIds when no topics are selected', async () => {
      const start = vi.fn()
      // getSelectedTopicIds/getSelectedSubtopicIds default to returning []
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1' }))
      mockUseStudyStart.mockReturnValue(buildDefaultStudy({ start }))
      const user = userEvent.setup()
      render(<StudyConfigForm subjects={SUBJECTS} />)
      await user.click(screen.getByRole('button', { name: 'Start studying' }))
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ topicIds: undefined, subtopicIds: undefined }),
      )
    })

    it('passes selected topic and subtopic arrays when topics are chosen', async () => {
      const start = vi.fn()
      const topicTree = buildDefaultTopicTree()
      topicTree.getSelectedTopicIds = vi.fn().mockReturnValue(['t1', 't2'])
      topicTree.getSelectedSubtopicIds = vi.fn().mockReturnValue(['st1'])
      mockUseStudyConfig.mockReturnValue(buildDefaultConfig({ subjectId: 'sub-1', topicTree }))
      mockUseStudyStart.mockReturnValue(buildDefaultStudy({ start }))
      const user = userEvent.setup()
      render(<StudyConfigForm subjects={SUBJECTS} />)
      await user.click(screen.getByRole('button', { name: 'Start studying' }))
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ topicIds: ['t1', 't2'], subtopicIds: ['st1'] }),
      )
    })
  })
})
