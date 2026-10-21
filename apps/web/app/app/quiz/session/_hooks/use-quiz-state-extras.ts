import { useMemo } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { AnswerFeedback } from '../../types'

type Opts = {
  opts: QuizStateOpts
  p: { feedback: Map<string, AnswerFeedback> }
}

/** Derives the question ids and passes the pipeline's feedback (seeded from the server load) on. */
export function useQuizStateExtras(args: Readonly<Opts>) {
  const { opts, p } = args
  const questionIds = useMemo(() => opts.questions.map((q) => q.id), [opts.questions])
  return { questionIds, feedback: p.feedback }
}
