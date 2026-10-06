import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { QuizStateOpts } from '../../session-types'
import type { DraftAnswer } from '../../types'
import { useAnswerPipeline } from './use-answer-pipeline'
import type { useProgressSync } from './use-progress-sync'

type Getters = { getQuestionId: () => string; getAnswerStartTime: () => number }

/** Practice-mode answer state seeded from the saved answers, plus the pipeline that writes it. */
export function useStudyPipeline(
  opts: QuizStateOpts,
  sync: ReturnType<typeof useProgressSync>,
  getters: Getters,
) {
  const router = useRouter()
  const { nav, currentIndexRef } = sync
  const [answers, setAnswers] = useState<Map<string, DraftAnswer>>(() =>
    opts.initialAnswers ? new Map(Object.entries(opts.initialAnswers)) : new Map(),
  )
  const answersRef = useRef(answers)
  answersRef.current = answers
  const pipeline = useAnswerPipeline({
    ...opts,
    ...getters,
    getCurrentIndex: () => nav.currentIndex,
    answers,
    setAnswers,
    answersRef,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    router,
  })
  return { pipeline, answers }
}
