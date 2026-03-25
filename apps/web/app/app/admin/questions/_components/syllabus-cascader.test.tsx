import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Base UI Select to avoid portal/floating-layer complexity in jsdom.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    disabled,
    children,
  }: {
    value: string
    disabled?: boolean
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <div data-testid="select" data-value={value} data-disabled={disabled ? 'true' : undefined}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
}))

import type { SyllabusTree } from '../../syllabus/types'
import { SyllabusCascader } from './syllabus-cascader'

const TREE: SyllabusTree = [
  {
    id: 'subj-1',
    code: '050',
    name: 'Meteorology',
    short: 'MET',
    sort_order: 1,
    questionCount: 10,
    topics: [
      {
        id: 'topic-1',
        code: '050 01',
        name: 'The Atmosphere',
        sort_order: 1,
        questionCount: 5,
        subtopics: [
          {
            id: 'sub-1',
            code: '050 01 01',
            name: 'Composition',
            sort_order: 1,
            questionCount: 3,
          },
        ],
      },
    ],
  },
]

describe('SyllabusCascader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the subject option with its code and name', () => {
    render(
      <SyllabusCascader
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
      />,
    )
    expect(screen.getByText('050 — Meteorology')).toBeInTheDocument()
  })

  it('renders Subject, Topic, and Subtopic labels', () => {
    render(
      <SyllabusCascader
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Subject *')).toBeInTheDocument()
    expect(screen.getByText('Topic *')).toBeInTheDocument()
    expect(screen.getByText('Subtopic')).toBeInTheDocument()
  })

  it('disables the topic select when no subject is selected', () => {
    render(
      <SyllabusCascader
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
      />,
    )
    // When subjectId is undefined the topics array is empty, so topic select is disabled.
    // Our mock renders data-disabled="true" on the wrapping div when disabled=true.
    const selects = screen.getAllByTestId('select')
    // selects[0]=subject, selects[1]=topic, selects[2]=subtopic
    expect(selects[1]).toHaveAttribute('data-disabled', 'true')
  })

  it('shows topic options when a subject is selected', () => {
    render(
      <SyllabusCascader
        tree={TREE}
        subjectId="subj-1"
        topicId={undefined}
        subtopicId={null}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
      />,
    )
    expect(screen.getByText('050 01 — The Atmosphere')).toBeInTheDocument()
  })
})
