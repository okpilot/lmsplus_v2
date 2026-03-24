'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionOption } from '../types'
import { ImageUploadField } from './image-upload-field'
import { OptionEditor } from './option-editor'
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
}: Props) {
  return (
    <div className="space-y-4">
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Question #</span>
          <Input
            value={questionNumber}
            onChange={(e) => onQuestionNumberChange(e.target.value)}
            placeholder="e.g. MET-001"
            disabled={isPending}
          />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">LO Reference</span>
          <Input
            value={loReference}
            onChange={(e) => onLoReferenceChange(e.target.value)}
            placeholder="e.g. LO 050 01 01 01"
            disabled={isPending}
          />
        </div>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Difficulty</span>
          <Select value={difficulty} onValueChange={onDifficultyChange} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
          <Select value={status} onValueChange={onStatusChange} disabled={isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
