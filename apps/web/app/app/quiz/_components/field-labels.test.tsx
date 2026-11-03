import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

// Collapsible mock forwards id and the rest of the props to the trigger.
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({
    children,
    ...props
  }: { children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { ModeToggle } from './mode-toggle'
import { QuestionCount } from './question-count'
import { QuestionFilters } from './question-filters'
import { SubjectSelect } from './subject-select'
import { TopicRow } from './topic-row'
import { TopicTree } from './topic-tree'

const SUBJECTS = [{ id: 'sub-1', code: '010', name: 'Air Law', short: 'ALW', questionCount: 40 }]

describe('quiz setup field labels (#1433 S7)', () => {
  it('AC2: SubjectSelect trigger is named by the visible Subject label', () => {
    render(<SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />)
    expect(screen.getByLabelText('Subject')).toHaveAttribute('data-testid', 'subject-trigger')
  })

  it('AC2: two SubjectSelects on one page get distinct label targets', () => {
    render(
      <>
        <SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />
        <SubjectSelect subjects={SUBJECTS} value="" onValueChange={vi.fn()} />
      </>,
    )
    const [a, b] = screen.getAllByLabelText('Subject')
    expect(a).not.toBe(b)
  })

  it('AC2: ModeToggle is a group named Mode', () => {
    render(<ModeToggle value="discovery" onValueChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument()
  })

  it('AC2: QuestionFilters is a group named Question Preferences', () => {
    render(
      <QuestionFilters
        value={['all']}
        onValueChange={vi.fn()}
        calcMode="all"
        onCalcModeChange={vi.fn()}
        imageMode="all"
        onImageModeChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: 'Question Preferences' })).toBeInTheDocument()
  })

  it('AC2: QuestionCount slider is named Number of Questions', () => {
    render(<QuestionCount value={25} max={100} onValueChange={vi.fn()} />)
    // Base UI hides an unmeasured thumb and jsdom never measures, so the name is read from the reference.
    const slider = screen.getByRole('slider', { hidden: true })
    const labelId = slider.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(labelId)).toHaveTextContent('Number of Questions')
  })

  it('AC2: TopicTree is a group named Topics and Select all checkbox is named', () => {
    render(
      <TopicTree
        topics={[
          {
            id: 't-b',
            code: '050-02',
            name: 'Wind',
            questionCount: 15,
            subtopics: [],
          },
        ]}
        checkedTopics={new Set<string>()}
        checkedSubtopics={new Set<string>()}
        onToggleTopic={vi.fn()}
        onToggleSubtopic={vi.fn()}
        onSelectAll={vi.fn()}
        totalQuestions={15}
        allSelected={false}
        filteredByTopic={null}
        filteredBySubtopic={null}
      />,
    )
    expect(screen.getByRole('group', { name: 'Topics' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Select all/ })).toBeInTheDocument()
  })

  it('AC2: TopicRow checkbox is named by its visible code and name', () => {
    render(
      <TopicRow
        code="050-01"
        name="The Atmosphere"
        count={12}
        filteredCount={null}
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /050-01 — The Atmosphere/ })).toBeInTheDocument()
  })
})
