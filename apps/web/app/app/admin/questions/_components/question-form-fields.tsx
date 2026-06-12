import { Textarea } from '@/components/ui/textarea'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { DifficultyStatusSelect } from './difficulty-status-select'
import { ImageUploadField } from './image-upload-field'
import { OptionEditor } from './option-editor'
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

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Question Text *
        </span>
        <Textarea
          value={questionText}
          onChange={(e) => onQuestionTextChange(e.target.value)}
          placeholder="Enter the question..."
          rows={3}
          disabled={isPending}
        />
      </div>

      <ImageUploadField
        label="Question Image (optional)"
        currentUrl={questionImageUrl}
        onUploaded={onQuestionImageChange}
        disabled={isPending}
      />

      <OptionEditor options={options} onChange={onOptionsChange} disabled={isPending} />

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Explanation</span>
        <Textarea
          value={explanationText}
          onChange={(e) => onExplanationTextChange(e.target.value)}
          placeholder="Explain the correct answer..."
          rows={2}
          disabled={isPending}
        />
      </div>

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
