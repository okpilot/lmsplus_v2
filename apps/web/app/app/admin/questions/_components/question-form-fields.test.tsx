import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all child components — this is a composition component with no logic of its own.
vi.mock('./syllabus-cascader', () => ({
  SyllabusCascader: () => <div data-testid="syllabus-cascader" />,
}))

vi.mock('./option-editor', () => ({
  OptionEditor: () => <div data-testid="option-editor" />,
}))

vi.mock('./image-upload-field', () => ({
  ImageUploadField: ({ label }: { label: string }) => (
    <div data-testid="image-upload-field">{label}</div>
  ),
}))

vi.mock('./difficulty-status-select', () => ({
  DifficultyStatusSelect: () => <div data-testid="difficulty-status-select" />,
}))

// Also mock the shadcn primitives used directly in this file.
vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { QuestionFormFields } from './question-form-fields'

const TREE: SyllabusTree = []
const OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha', correct: true },
  { id: 'b', text: 'Beta', correct: false },
  { id: 'c', text: 'Gamma', correct: false },
  { id: 'd', text: 'Delta', correct: false },
]

describe('QuestionFormFields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders without crashing when given all required props', () => {
    render(
      <QuestionFormFields
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        questionNumber="MET-001"
        loReference="LO 050 01 01 01"
        questionText="What is the atmosphere?"
        options={OPTIONS}
        explanationText="The atmosphere is..."
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="medium"
        status="active"
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('syllabus-cascader')).toBeInTheDocument()
    expect(screen.getByTestId('option-editor')).toBeInTheDocument()
    expect(screen.getByTestId('difficulty-status-select')).toBeInTheDocument()
    expect(screen.getAllByTestId('image-upload-field')).toHaveLength(2)
  })

  it('renders question number and LO reference inputs with supplied values', () => {
    render(
      <QuestionFormFields
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        questionNumber="MET-042"
        loReference="LO 050 02 01 03"
        questionText="Sample question"
        options={OPTIONS}
        explanationText=""
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="easy"
        status="draft"
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('MET-042')).toBeInTheDocument()
    expect(screen.getByDisplayValue('LO 050 02 01 03')).toBeInTheDocument()
  })
})
