'use client'

import { UpsertQuestionSchema } from '@repo/db/schema'
import type { ReactElement } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LoadingButton } from '@/components/ui/loading-button'
import type { SyllabusTree } from '../../syllabus/types'
import { buildQuestionPayload } from '../_hooks/question-payload'
import { useCorrectOptionLoader } from '../_hooks/use-correct-option-loader'
import { useQuestionFormState } from '../_hooks/use-question-form-state'
import { upsertQuestion } from '../actions/upsert-question'
import type { QuestionRow } from '../types'
import { QuestionFormFields } from './question-form-fields'

type Props = { tree: SyllabusTree; question?: QuestionRow; trigger: ReactElement }

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function QuestionFormDialog({ tree, question, trigger }: Readonly<Props>) {
  const isEdit = !!question
  const { open, setOpen, isPending, startTransition, handleOpenChange } = useCorrectOptionLoader({
    questionId: question?.id,
    isEdit,
    getSetCorrectOptionId: () => h.setCorrectOptionId,
  })
  const { state: s, handlers: h } = useQuestionFormState(question, open)

  const payload = buildQuestionPayload(s, question?.id)
  const canSubmit = UpsertQuestionSchema.safeParse(payload).success

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await upsertQuestion(payload)
        if (result.success) {
          toast.success(isEdit ? 'Question updated' : 'Question created')
          setOpen(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  const submitLabel = isEdit ? 'Save Changes' : 'Create Question'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-(--dialog-scroll-h) overflow-y-auto sm:max-w-dialog-wide">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Question' : 'New Question'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the question details below.'
              : 'Fill in the details to create a new question.'}
          </DialogDescription>
        </DialogHeader>

        <QuestionFormFields
          tree={tree}
          subjectId={s.subjectId}
          topicId={s.topicId}
          subtopicId={s.subtopicId}
          questionNumber={s.questionNumber}
          loReference={s.loReference}
          questionText={s.questionText}
          options={s.options}
          correctOptionId={s.correctOptionId}
          explanationText={s.explanationText}
          questionImageUrl={s.questionImageUrl}
          explanationImageUrl={s.explanationImageUrl}
          onQuestionImageChange={(url) => h.setQuestionImageUrl(url || null)}
          onExplanationImageChange={(url) => h.setExplanationImageUrl(url || null)}
          difficulty={s.difficulty}
          status={s.status}
          hasCalculations={s.hasCalculations}
          isPending={isPending}
          onSubjectChange={h.handleSubjectChange}
          onTopicChange={h.handleTopicChange}
          onSubtopicChange={h.setSubtopicId}
          onQuestionNumberChange={h.setQuestionNumber}
          onLoReferenceChange={h.setLoReference}
          onQuestionTextChange={h.setQuestionText}
          onOptionsChange={h.setOptions}
          onCorrectOptionChange={h.setCorrectOptionId}
          onExplanationTextChange={h.setExplanationText}
          onDifficultyChange={(v) => {
            if (v === 'easy' || v === 'medium' || v === 'hard') h.setDifficulty(v)
          }}
          onStatusChange={(v) => {
            if (v === 'active' || v === 'draft') h.setStatus(v)
          }}
          onHasCalculationsChange={h.setHasCalculations}
        />

        <DialogFooter showCloseButton>
          <LoadingButton
            onClick={handleSubmit}
            loading={isPending}
            disabled={!canSubmit}
            loadingText="Saving..."
          >
            {submitLabel}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
