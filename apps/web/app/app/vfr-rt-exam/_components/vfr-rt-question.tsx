'use client'

import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'
import type { AnswerState } from '../_hooks/use-vfr-rt-answers'
import { DialogFillRenderer } from './dialog-fill-renderer'
import { McRenderer } from './mc-renderer'
import { ShortAnswerRenderer } from './short-answer-renderer'

type VfrRtQuestionViewProps = {
  question: VfrRtQuestion
  headingId: string
  answer: AnswerState | undefined
  setMc: (qId: string, optionId: string) => void
  setShort: (qId: string, text: string) => void
  setBlank: (qId: string, blankIndex: number, text: string) => void
}

export function VfrRtQuestionView({
  question,
  headingId,
  answer,
  setMc,
  setShort,
  setBlank,
}: VfrRtQuestionViewProps) {
  if (question.question_type === 'short_answer') {
    return (
      <ShortAnswerRenderer value={answer?.short ?? ''} onChange={(t) => setShort(question.id, t)} />
    )
  }

  if (question.question_type === 'multiple_choice') {
    return (
      <McRenderer
        options={question.options ?? []}
        value={answer?.mc ?? null}
        onChange={(o) => setMc(question.id, o)}
        ariaLabelledBy={headingId}
      />
    )
  }

  return (
    <DialogFillRenderer
      template={question.dialog_template ?? ''}
      values={answer?.blanks ?? {}}
      onChange={(bi, t) => setBlank(question.id, bi, t)}
    />
  )
}
