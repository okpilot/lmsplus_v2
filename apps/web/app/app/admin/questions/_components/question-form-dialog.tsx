'use client'

import type { ReactNode } from 'react'
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
import { upsertQuestion } from '../actions/upsert-question'
import type { QuestionOption, QuestionRow } from '../types'
import { QuestionFormFields } from './question-form-fields'

const EMPTY_OPTIONS: QuestionOption[] = [
  { id: 'a', text: '', correct: false },
  { id: 'b', text: '', correct: false },
  { id: 'c', text: '', correct: false },
  { id: 'd', text: '', correct: false },
]

type Props = { tree: SyllabusTree; question?: QuestionRow; trigger: ReactNode }

export function QuestionFormDialog({ tree, question, trigger }: Props) {
  const isEdit = !!question
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [subjectId, setSubjectId] = useState(question?.subject_id)
  const [topicId, setTopicId] = useState(question?.topic_id)
  const [subtopicId, setSubtopicId] = useState(question?.subtopic_id ?? null)
  const [questionNumber, setQuestionNumber] = useState(question?.question_number ?? '')
  const [loReference, setLoReference] = useState(question?.lo_reference ?? '')
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [options, setOptions] = useState<QuestionOption[]>(question?.options ?? EMPTY_OPTIONS)
  const [explanationText, setExplanationText] = useState(question?.explanation_text ?? '')
  const [questionImageUrl, setQuestionImageUrl] = useState(question?.question_image_url ?? null)
  const [explanationImageUrl, setExplanationImageUrl] = useState(
    question?.explanation_image_url ?? null,
  )
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'medium')
  const [status, setStatus] = useState(question?.status ?? 'draft')

  function resetForm() {
    setSubjectId(question?.subject_id)
    setTopicId(question?.topic_id)
    setSubtopicId(question?.subtopic_id ?? null)
    setQuestionNumber(question?.question_number ?? '')
    setLoReference(question?.lo_reference ?? '')
    setQuestionText(question?.question_text ?? '')
    setOptions(question?.options ?? EMPTY_OPTIONS)
    setExplanationText(question?.explanation_text ?? '')
    setQuestionImageUrl(question?.question_image_url ?? null)
    setExplanationImageUrl(question?.explanation_image_url ?? null)
    setDifficulty(question?.difficulty ?? 'medium')
    setStatus(question?.status ?? 'draft')
  }

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setTopicId(undefined)
    setSubtopicId(null)
  }

  function handleTopicChange(id: string) {
    setTopicId(id)
    setSubtopicId(null)
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        const result = await upsertQuestion({
          ...(isEdit ? { id: question.id } : {}),
          subject_id: subjectId,
          topic_id: topicId,
          subtopic_id: subtopicId,
          question_number: questionNumber || null,
          lo_reference: loReference || null,
          question_text: questionText,
          options,
          explanation_text: explanationText,
          question_image_url: questionImageUrl || null,
          explanation_image_url: explanationImageUrl || null,
          difficulty,
          status,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) resetForm()
      }}
    >
      <DialogTrigger render={<>{trigger}</>} />
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
          subjectId={subjectId}
          topicId={topicId}
          subtopicId={subtopicId}
          questionNumber={questionNumber}
          loReference={loReference}
          questionText={questionText}
          options={options}
          explanationText={explanationText}
          questionImageUrl={questionImageUrl}
          explanationImageUrl={explanationImageUrl}
          onQuestionImageChange={(url) => setQuestionImageUrl(url || null)}
          onExplanationImageChange={(url) => setExplanationImageUrl(url || null)}
          difficulty={difficulty}
          status={status}
          isPending={isPending}
          onSubjectChange={handleSubjectChange}
          onTopicChange={handleTopicChange}
          onSubtopicChange={setSubtopicId}
          onQuestionNumberChange={setQuestionNumber}
          onLoReferenceChange={setLoReference}
          onQuestionTextChange={setQuestionText}
          onOptionsChange={setOptions}
          onExplanationTextChange={setExplanationText}
          onDifficultyChange={(v) => v && setDifficulty(v as 'easy' | 'medium' | 'hard')}
          onStatusChange={(v) => v && setStatus(v as 'active' | 'draft')}
        />

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Question'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
