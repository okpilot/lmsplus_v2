import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { AnswerKeyField } from './answer-key-field'
import { DifficultyStatusSelect } from './difficulty-status-select'
import { ImageUploadField } from './image-upload-field'
import { LabeledTextarea } from './labeled-textarea'
import { QuestionCalculationsField } from './question-calculations-field'
import { QuestionMetaFields } from './question-meta-fields'
import { SyllabusCascader } from './syllabus-cascader'

type Props = {
  tree: SyllabusTree
  subjectId: string | undefined
  topicId: string | undefined
  subtopicId: string | null
  questionNumber: string
  loReference: string
  questionText: string
  options: QuestionOption[]
  correctOptionId: 'a' | 'b' | 'c' | 'd' | ''
  explanationText: string
  questionImageUrl: string | null
  explanationImageUrl: string | null
  onQuestionImageChange: (url: string) => void
  onExplanationImageChange: (url: string) => void
  difficulty: string
  status: string
  hasCalculations: boolean
  isPending: boolean
  onSubjectChange: (id: string) => void
  onTopicChange: (id: string) => void
  onSubtopicChange: (id: string | null) => void
  onQuestionNumberChange: (v: string) => void
  onLoReferenceChange: (v: string) => void
  onQuestionTextChange: (v: string) => void
  onOptionsChange: (opts: QuestionOption[]) => void
  onCorrectOptionChange: (id: 'a' | 'b' | 'c' | 'd') => void
  onExplanationTextChange: (v: string) => void
  onDifficultyChange: (v: string | null) => void
  onStatusChange: (v: string | null) => void
  onHasCalculationsChange: (v: boolean) => void
}

export function QuestionFormFields({
  tree,
  subjectId,
  topicId,
  subtopicId,
  questionNumber,
  loReference,
  questionText,
  options,
  correctOptionId,
  explanationText,
  questionImageUrl,
  explanationImageUrl,
  onQuestionImageChange,
  onExplanationImageChange,
  difficulty,
  status,
  hasCalculations,
  isPending,
  onSubjectChange,
  onTopicChange,
  onSubtopicChange,
  onQuestionNumberChange,
  onLoReferenceChange,
  onQuestionTextChange,
  onOptionsChange,
  onCorrectOptionChange,
  onExplanationTextChange,
  onDifficultyChange,
  onStatusChange,
  onHasCalculationsChange,
}: Readonly<Props>) {
  return (
    <div className="min-w-0 space-y-4">
      <SyllabusCascader
        tree={tree}
        subjectId={subjectId}
        topicId={topicId}
        subtopicId={subtopicId}
        onSubjectChange={onSubjectChange}
        onTopicChange={onTopicChange}
        onSubtopicChange={onSubtopicChange}
        disabled={isPending}
      />
      <QuestionMetaFields
        questionNumber={questionNumber}
        loReference={loReference}
        isPending={isPending}
        onQuestionNumberChange={onQuestionNumberChange}
        onLoReferenceChange={onLoReferenceChange}
      />
      <LabeledTextarea
        label="Question Text *"
        value={questionText}
        placeholder="Enter the question..."
        rows={3}
        disabled={isPending}
        onChange={onQuestionTextChange}
      />
      <ImageUploadField
        label="Question Image (optional)"
        currentUrl={questionImageUrl}
        onUploaded={onQuestionImageChange}
        disabled={isPending}
      />
      <AnswerKeyField
        options={options}
        correctOptionId={correctOptionId}
        isPending={isPending}
        onOptionsChange={onOptionsChange}
        onCorrectOptionChange={onCorrectOptionChange}
      />
      <LabeledTextarea
        label="Explanation"
        value={explanationText}
        placeholder="Explain the correct answer..."
        rows={2}
        disabled={isPending}
        onChange={onExplanationTextChange}
      />
      <ImageUploadField
        label="Explanation Image (optional)"
        currentUrl={explanationImageUrl}
        onUploaded={onExplanationImageChange}
        disabled={isPending}
      />
      <DifficultyStatusSelect
        difficulty={difficulty}
        status={status}
        isPending={isPending}
        onDifficultyChange={onDifficultyChange}
        onStatusChange={onStatusChange}
      />
      <QuestionCalculationsField
        hasCalculations={hasCalculations}
        isPending={isPending}
        onHasCalculationsChange={onHasCalculationsChange}
      />
    </div>
  )
}
