import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'

// ---- Mocks ----------------------------------------------------------------

const { mockHandleStart, mockUseVfrRtStart, mockUseVfrRtParts } = vi.hoisted(() => {
  const mockHandleStart = vi.fn()
  const mockUseVfrRtStart = vi.fn()
  const mockUseVfrRtParts = vi.fn()
  return { mockHandleStart, mockUseVfrRtStart, mockUseVfrRtParts }
})

vi.mock('../_hooks/use-vfr-rt-start', () => ({
  useVfrRtStart: (...args: unknown[]) => mockUseVfrRtStart(...args),
}))

vi.mock('../_hooks/use-vfr-rt-parts', () => ({
  useVfrRtParts: (...args: unknown[]) => mockUseVfrRtParts(...args),
}))

// QuestionCount and TopicTree are UI widgets — stub to keep tests fast.
vi.mock('@/app/app/quiz/_components/question-count', () => ({
  QuestionCount: () => <div data-testid="question-count" />,
}))
vi.mock('@/app/app/quiz/_components/topic-tree', () => ({
  TopicTree: () => <div data-testid="topic-tree" />,
}))

// ---- Subject under test ---------------------------------------------------

import { VfrRtConfigForm } from './vfr-rt-config-form'

// ---- Fixtures -------------------------------------------------------------

const PARTS: TopicWithSubtopics[] = [
  { id: 'p1', code: 'P1', name: 'Part 1', questionCount: 10, subtopics: [] },
]

const BASE_PROPS = {
  userId: 'user-1',
  subjectId: 'subj-rt',
  parts: PARTS,
}

function makePartsState(overrides: Partial<ReturnType<typeof defaultPartsState>> = {}) {
  return { ...defaultPartsState(), ...overrides }
}

function defaultPartsState() {
  return {
    checkedTopics: new Set(['p1']),
    checkedSubtopics: new Set<string>(),
    totalQuestions: 10,
    allSelected: true,
    selectedTopicIds: ['p1'],
    toggleTopic: vi.fn(),
    toggleSubtopic: vi.fn(),
    selectAll: vi.fn(),
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  // Default: one part selected, no loading, no error
  mockUseVfrRtParts.mockReturnValue(makePartsState())
  mockUseVfrRtStart.mockReturnValue({ loading: false, error: null, handleStart: mockHandleStart })
})

// ---- canStart gate --------------------------------------------------------

describe('VfrRtConfigForm — Start Practice button', () => {
  it('is enabled when at least one topic is selected and totalQuestions > 0', () => {
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /start practice/i })).not.toBeDisabled()
  })

  it('is disabled when no topics are selected', () => {
    mockUseVfrRtParts.mockReturnValue(
      makePartsState({ selectedTopicIds: [], totalQuestions: 0, checkedTopics: new Set() }),
    )
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })

  it('is disabled when topics are selected but totalQuestions is 0', () => {
    mockUseVfrRtParts.mockReturnValue(
      makePartsState({ selectedTopicIds: ['p1'], totalQuestions: 0 }),
    )
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /start practice/i })).toBeDisabled()
  })

  it('is disabled while a start is in progress', () => {
    mockUseVfrRtStart.mockReturnValue({ loading: true, error: null, handleStart: mockHandleStart })
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    // In the loading state the button label is "Starting...", not "Start Practice".
    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()
  })
})

// ---- Error banner --------------------------------------------------------

describe('VfrRtConfigForm — error display', () => {
  it('renders an error alert when useVfrRtStart returns an error', () => {
    mockUseVfrRtStart.mockReturnValue({
      loading: false,
      error: 'No questions available',
      handleStart: mockHandleStart,
    })
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No questions available')
  })

  it('does not render an error alert when there is no error', () => {
    render(<VfrRtConfigForm {...BASE_PROPS} />)
    expect(screen.queryByRole('alert')).toBeNull()
    // Also confirm the button renders so the test isn't vacuous
    expect(screen.getByRole('button', { name: /start practice/i })).toBeInTheDocument()
  })
})
