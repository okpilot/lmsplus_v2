import { useMemo } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { useRestoredFeedback } from './use-restored-feedback'

type Opts = {
  opts: QuizStateOpts
  answers: Map<string, DraftAnswer>
  p: { feedback: Map<string, AnswerFeedback> }
}

/** Derives the question ids and restores practice feedback. */
export function useQuizStateExtras(args: Readonly<Opts>) {
  const { opts, answers, p } = args
  const questionIds = useMemo(() => opts.questions.map((q) => q.id), [opts.questions])
  const feedback = useRestoredFeedback({
    enabled: opts.mode === 'study',
    sessionId: opts.sessionId,
    restorable: opts.initialAnswers,
    answers,
    feedback: p.feedback,
  })
  return { questionIds, feedback }
}
