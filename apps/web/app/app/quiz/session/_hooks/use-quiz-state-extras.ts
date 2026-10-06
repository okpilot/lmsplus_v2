import { useMemo, useRef } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { useQuizNavigationGuard } from './use-quiz-navigation-guard'
import { useRestoredFeedback } from './use-restored-feedback'

type Opts = {
  opts: QuizStateOpts
  isExam: boolean
  answers: Map<string, DraftAnswer>
  p: { feedback: Map<string, AnswerFeedback>; submitted: { current: boolean } }
}

/** Arms the leave-page guard, derives the question ids and restores practice feedback. */
export function useQuizStateExtras(args: Readonly<Opts>) {
  const { opts, isExam, answers, p } = args
  const initialSize = useRef(opts.initialAnswers ? Object.keys(opts.initialAnswers).length : 0)
  useQuizNavigationGuard(!isExam && answers.size > initialSize.current, p.submitted.current)
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
