'use client'

import { useState } from 'react'
import { BusyLabel } from '@/components/ui/busy-label'
import { Button } from '@/components/ui/button'
import type { AnswerResult, SessionState } from '../_types/session'
import { AnswerOptions } from './answer-options'
import { FeedbackPanel } from './feedback-panel'

type SessionAnswerBlockProps = {
  options: { id: string; text: string }[]
  onSubmit: (selectedId: string) => void
  submitting: boolean
  state: SessionState
  feedbackData: Extract<AnswerResult, { success: true }> | null
  selectedOption: string | null
  onNext: () => void
}

export function SessionAnswerBlock({
  options,
  onSubmit,
  submitting,
  state,
  feedbackData,
  selectedOption,
  onNext,
}: Readonly<SessionAnswerBlockProps>) {
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <>
      <AnswerOptions
        options={options}
        disabled={submitting || state === 'feedback'}
        correctOptionId={feedbackData?.correctOptionId}
        selectedOptionId={selectedOption}
        onSelectionChange={setPicked}
      />
      {state !== 'feedback' && (
        <Button
          type="button"
          disabled={!picked || submitting}
          aria-busy={submitting || undefined}
          onClick={() => picked && onSubmit(picked)}
        >
          <BusyLabel busy={submitting}>Submit Answer</BusyLabel>
        </Button>
      )}
      {state === 'feedback' && feedbackData && (
        <FeedbackPanel
          isCorrect={feedbackData.isCorrect}
          explanationText={feedbackData.explanationText}
          explanationImageUrl={feedbackData.explanationImageUrl}
          onNext={onNext}
        />
      )}
    </>
  )
}
