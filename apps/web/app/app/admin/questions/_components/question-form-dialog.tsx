'use client'

import type { ReactElement } from 'react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { SyllabusTree } from '../../syllabus/types'
import { useQuestionFormState } from '../_hooks/use-question-form-state'
import { upsertQuestion } from '../actions/upsert-question'
import type { QuestionRow } from '../types'
import { QuestionFormFields } from './question-form-fields'

type Props = { tree: SyllabusTree; question?: QuestionRow; trigger: ReactElement }

export function QuestionFormDialog({ tree, question, trigger }: Readonly<Props>) {
  const isEdit = !!question
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { state: s, handlers: h } = useQuestionFormState(question, open)

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await upsertQuestion({
          ...(isEdit ? { id: question.id } : {}),
          subject_id: s.subjectId,
          topic_id: s.topicId,
          subtopic_id: s.subtopicId,
          question_number: s.questionNumber || null,
          lo_reference: s.loReference || null,
          question_text: s.questionText,
          options: s.options,
          explanation_text: s.explanationText,
          question_image_url: s.questionImageUrl || null,
          explanation_image_url: s.explanationImageUrl || null,
          difficulty: s.difficulty,
          status: s.status,
        })
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isPending) setOpen(v)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
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
          explanationText={s.explanationText}
          questionImageUrl={s.questionImageUrl}
          explanationImageUrl={s.explanationImageUrl}
          onQuestionImageChange={(url) => h.setQuestionImageUrl(url || null)}
          onExplanationImageChange={(url) => h.setExplanationImageUrl(url || null)}
          difficulty={s.difficulty}
          status={s.status}
          isPending={isPending}
          onSubjectChange={h.handleSubjectChange}
          onTopicChange={h.handleTopicChange}
          onSubtopicChange={h.setSubtopicId}
          onQuestionNumberChange={h.setQuestionNumber}
          onLoReferenceChange={h.setLoReference}
          onQuestionTextChange={h.setQuestionText}
          onOptionsChange={h.setOptions}
          onExplanationTextChange={h.setExplanationText}
          onDifficultyChange={(v) => {
            if (v === 'easy' || v === 'medium' || v === 'hard') h.setDifficulty(v)
          }}
          onStatusChange={(v) => {
            if (v === 'active' || v === 'draft') h.setStatus(v)
          }}
        />

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
