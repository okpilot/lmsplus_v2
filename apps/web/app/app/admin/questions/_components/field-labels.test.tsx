import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'

// Select mock forwards id and aria-label to the trigger.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({
    children,
    ...props
  }: { children?: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { DifficultyStatusSelect } from './difficulty-status-select'
import { ImageUploadField } from './image-upload-field'
import { OptionEditor } from './option-editor'
import { QuestionMetaFields } from './question-meta-fields'
import { SyllabusCascader } from './syllabus-cascader'

const TREE: SyllabusTree = [
  {
    id: 'subj-1',
    code: '050',
    name: 'Meteorology',
    short: 'MET',
    sort_order: 1,
    questionCount: 10,
    topics: [],
  },
]

const OPTIONS: QuestionOption[] = (['a', 'b', 'c', 'd'] as const).map((id) => ({ id, text: id }))

describe('admin question form field labels (#1433 S7)', () => {
  it('AC2: SyllabusCascader Subject, Topic, Subtopic controls are labelled', () => {
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
    expect(screen.getByLabelText('Subject').tagName).toBe('BUTTON')
    expect(screen.getByLabelText('Topic').tagName).toBe('BUTTON')
    expect(screen.getByLabelText('Subtopic (optional)').tagName).toBe('BUTTON')
  })

  it('AC2: DifficultyStatusSelect triggers are labelled Difficulty and Status', () => {
    render(
      <DifficultyStatusSelect
        difficulty="medium"
        status="active"
        isPending={false}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Difficulty').tagName).toBe('LABEL')
    expect(screen.getByText('Status').tagName).toBe('LABEL')
    expect(screen.getByLabelText('Difficulty').tagName).toBe('BUTTON')
    expect(screen.getByLabelText('Status').tagName).toBe('BUTTON')
  })

  it('AC2: QuestionMetaFields inputs are labelled', () => {
    render(
      <QuestionMetaFields
        questionNumber=""
        loReference=""
        isPending={false}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Question # (optional)').tagName).toBe('INPUT')
    expect(screen.getByLabelText('LO Reference (optional)').tagName).toBe('INPUT')
  })

  it('AC2: ImageUploadField file input is labelled by its label prop', () => {
    render(
      <ImageUploadField label="Question Image (optional)" currentUrl={null} onUploaded={vi.fn()} />,
    )
    expect(screen.getByLabelText('Question Image (optional)')).toHaveAttribute('type', 'file')
  })

  it('AC2: OptionEditor is a group named Options with named option inputs', () => {
    render(
      <OptionEditor
        options={OPTIONS}
        correctOptionId=""
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('group', { name: 'Options' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option A' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Option D' })).toBeInTheDocument()
  })

  it('AC2: clicking the Correct text selects that option', async () => {
    const onCorrectChange = vi.fn()
    render(
      <OptionEditor
        options={OPTIONS}
        correctOptionId=""
        onChange={vi.fn()}
        onCorrectChange={onCorrectChange}
      />,
    )
    await userEvent.click(screen.getAllByText('Correct')[1] as HTMLElement)
    expect(onCorrectChange).toHaveBeenCalledWith('b')
  })

  it('AC2: Correct text is a label, not a clickable span', () => {
    render(
      <OptionEditor
        options={OPTIONS}
        correctOptionId=""
        onChange={vi.fn()}
        onCorrectChange={vi.fn()}
      />,
    )
    expect(screen.getAllByText('Correct')[0]?.closest('label')).not.toBeNull()
  })
})
