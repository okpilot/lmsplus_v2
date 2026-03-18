import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ------------------------------------------------------------------

// Mock Checkbox to a plain input.
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
  }: {
    checked: boolean
    onCheckedChange: (checked: boolean | 'indeterminate') => void
  }) => (
    <input
      type="checkbox"
      data-testid="select-all-checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
    />
  ),
}))

// Mock TopicRow to a focused stand-in that exposes the key props via data-*.
vi.mock('./topic-row', () => ({
  TopicRow: ({
    code,
    name,
    count,
    checked,
    onCheckedChange,
    isExpanded,
    onToggleExpand,
    indented,
  }: {
    code: string
    name: string
    count: number
    checked: boolean
    onCheckedChange: (c: boolean) => void
    isExpanded?: boolean
    onToggleExpand?: () => void
    indented?: boolean
  }) => (
    <div
      data-testid={`topic-row-${code}`}
      data-checked={String(checked)}
      data-expanded={String(isExpanded ?? false)}
      data-indented={String(indented ?? false)}
    >
      <span>{`${code} — ${name}`}</span>
      <span>{count}</span>
      <button type="button" data-testid={`check-${code}`} onClick={() => onCheckedChange(!checked)}>
        toggle
      </button>
      {onToggleExpand && (
        <button type="button" data-testid={`expand-${code}`} onClick={onToggleExpand}>
          expand
        </button>
      )}
    </div>
  ),
}))

// ---- Subject under test -----------------------------------------------------

import { TopicTree } from './topic-tree'

// ---- Fixtures ---------------------------------------------------------------

const TOPIC_WITH_SUBTOPICS = {
  id: 't-a',
  code: '050-01',
  name: 'The Atmosphere',
  questionCount: 20,
  subtopics: [
    { id: 'st-a1', code: '050-01-01', name: 'Composition', questionCount: 10 },
    { id: 'st-a2', code: '050-01-02', name: 'Pressure', questionCount: 10 },
  ],
}

const TOPIC_WITHOUT_SUBTOPICS = {
  id: 't-b',
  code: '050-02',
  name: 'Wind',
  questionCount: 15,
  subtopics: [],
}

function renderTree(overrides: Partial<Parameters<typeof TopicTree>[0]> = {}) {
  const props = {
    topics: [TOPIC_WITH_SUBTOPICS, TOPIC_WITHOUT_SUBTOPICS],
    checkedTopics: new Set<string>(),
    checkedSubtopics: new Set<string>(),
    onToggleTopic: vi.fn(),
    onToggleSubtopic: vi.fn(),
    onSelectAll: vi.fn(),
    totalQuestions: 35,
    allSelected: false,
    ...overrides,
  }
  return render(<TopicTree {...props} />)
}

// ---- Tests ------------------------------------------------------------------

describe('TopicTree', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders all topic rows', () => {
    renderTree()
    expect(screen.getByTestId('topic-row-050-01')).toBeInTheDocument()
    expect(screen.getByTestId('topic-row-050-02')).toBeInTheDocument()
  })

  it('displays the total questions available count', () => {
    renderTree({ totalQuestions: 35 })
    expect(screen.getByText('35 questions available')).toBeInTheDocument()
  })

  it('calls onToggleTopic when a topic row toggle is clicked', async () => {
    const onToggleTopic = vi.fn()
    const user = userEvent.setup()
    renderTree({ onToggleTopic })
    await user.click(screen.getByTestId('check-050-01'))
    expect(onToggleTopic).toHaveBeenCalledWith('t-a')
  })

  it('calls onSelectAll when the Select All checkbox changes', async () => {
    const onSelectAll = vi.fn()
    const user = userEvent.setup()
    renderTree({ onSelectAll })
    await user.click(screen.getByTestId('select-all-checkbox'))
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it('renders a topic with subtopics with an expand button', () => {
    renderTree()
    expect(screen.getByTestId('expand-050-01')).toBeInTheDocument()
  })

  it('does not render an expand button for a topic without subtopics', () => {
    renderTree()
    expect(screen.queryByTestId('expand-050-02')).not.toBeInTheDocument()
  })

  it('shows subtopic rows after the topic is expanded', async () => {
    const user = userEvent.setup()
    renderTree()
    expect(screen.queryByTestId('topic-row-050-01-01')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('expand-050-01'))

    expect(screen.getByTestId('topic-row-050-01-01')).toBeInTheDocument()
    expect(screen.getByTestId('topic-row-050-01-02')).toBeInTheDocument()
  })

  it('hides subtopic rows after collapsing an expanded topic', async () => {
    const user = userEvent.setup()
    renderTree()
    await user.click(screen.getByTestId('expand-050-01'))
    expect(screen.getByTestId('topic-row-050-01-01')).toBeInTheDocument()

    await user.click(screen.getByTestId('expand-050-01'))

    expect(screen.queryByTestId('topic-row-050-01-01')).not.toBeInTheDocument()
  })

  it('renders subtopic rows as indented', async () => {
    const user = userEvent.setup()
    renderTree()
    await user.click(screen.getByTestId('expand-050-01'))

    expect(screen.getByTestId('topic-row-050-01-01')).toHaveAttribute('data-indented', 'true')
  })

  it('calls onToggleSubtopic with subtopicId and topicId when a subtopic toggle is clicked', async () => {
    const onToggleSubtopic = vi.fn()
    const user = userEvent.setup()
    renderTree({ onToggleSubtopic })
    await user.click(screen.getByTestId('expand-050-01'))
    await user.click(screen.getByTestId('check-050-01-01'))
    expect(onToggleSubtopic).toHaveBeenCalledWith('st-a1', 't-a')
  })

  it('reflects checked state for topics via data-checked attribute', () => {
    renderTree({ checkedTopics: new Set(['t-a']) })
    expect(screen.getByTestId('topic-row-050-01')).toHaveAttribute('data-checked', 'true')
    expect(screen.getByTestId('topic-row-050-02')).toHaveAttribute('data-checked', 'false')
  })

  it('reflects allSelected state on the Select All checkbox', () => {
    renderTree({ allSelected: true })
    expect(screen.getByTestId('select-all-checkbox')).toBeChecked()
  })

  it('renders an empty list without crashing when topics array is empty', () => {
    renderTree({ topics: [], totalQuestions: 0 })
    expect(screen.getByText('0 questions available')).toBeInTheDocument()
  })
})
