import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock all child components — this is a composition component with no logic of its own.
vi.mock('./syllabus-cascader', () => ({
  SyllabusCascader: () => <div data-testid="syllabus-cascader" />,
}))

const answerKeyFieldSpy = vi.fn((_props: unknown) => <div data-testid="answer-key-field" />)

vi.mock('./answer-key-field', () => ({
  AnswerKeyField: (props: unknown) => answerKeyFieldSpy(props),
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

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked: boolean
    onCheckedChange: (c: boolean) => void
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...props}
    />
  ),
}))

import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { QuestionFormFields } from './question-form-fields'

const TREE: SyllabusTree = []
const OPTIONS: QuestionOption[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
  { id: 'd', text: 'Delta' },
]

describe('QuestionFormFields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // resetAllMocks() clears the spy's implementation; restore the render output.
    answerKeyFieldSpy.mockImplementation(() => <div data-testid="answer-key-field" />)
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
        correctOptionId="a"
        explanationText="The atmosphere is..."
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="medium"
        status="active"
        hasCalculations={false}
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={vi.fn()}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
        onHasCalculationsChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('syllabus-cascader')).toBeInTheDocument()
    expect(screen.getByTestId('answer-key-field')).toBeInTheDocument()
    expect(screen.getByTestId('difficulty-status-select')).toBeInTheDocument()
    expect(screen.getAllByTestId('image-upload-field')).toHaveLength(2)
  })

  it('renders the answer-key controls with the current options and selected option', () => {
    const onOptionsChange = vi.fn()
    const onCorrectOptionChange = vi.fn()
    render(
      <QuestionFormFields
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        questionNumber=""
        loReference=""
        questionText=""
        options={OPTIONS}
        correctOptionId="b"
        explanationText=""
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="medium"
        status="active"
        hasCalculations={false}
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={onOptionsChange}
        onCorrectOptionChange={onCorrectOptionChange}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
        onHasCalculationsChange={vi.fn()}
      />,
    )

    const forwarded = answerKeyFieldSpy.mock.calls.at(-1)?.[0]
    expect(forwarded).toEqual(
      expect.objectContaining({
        options: OPTIONS,
        correctOptionId: 'b',
        isPending: false,
        onOptionsChange,
        onCorrectOptionChange,
      }),
    )
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
        correctOptionId="a"
        explanationText=""
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="easy"
        status="draft"
        hasCalculations={false}
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={vi.fn()}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
        onHasCalculationsChange={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('MET-042')).toBeInTheDocument()
    expect(screen.getByDisplayValue('LO 050 02 01 03')).toBeInTheDocument()
  })

  it('fires onHasCalculationsChange when the calculations checkbox is toggled', () => {
    const onHasCalculationsChange = vi.fn()
    render(
      <QuestionFormFields
        tree={TREE}
        subjectId={undefined}
        topicId={undefined}
        subtopicId={null}
        questionNumber=""
        loReference=""
        questionText=""
        options={OPTIONS}
        correctOptionId="a"
        explanationText=""
        questionImageUrl={null}
        explanationImageUrl={null}
        difficulty="medium"
        status="draft"
        hasCalculations={false}
        isPending={false}
        onSubjectChange={vi.fn()}
        onTopicChange={vi.fn()}
        onSubtopicChange={vi.fn()}
        onQuestionNumberChange={vi.fn()}
        onLoReferenceChange={vi.fn()}
        onQuestionTextChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onCorrectOptionChange={vi.fn()}
        onExplanationTextChange={vi.fn()}
        onQuestionImageChange={vi.fn()}
        onExplanationImageChange={vi.fn()}
        onDifficultyChange={vi.fn()}
        onStatusChange={vi.fn()}
        onHasCalculationsChange={onHasCalculationsChange}
      />,
    )

    screen.getByLabelText('Calculation question').click()
    expect(onHasCalculationsChange).toHaveBeenCalledWith(true)
  })
})
