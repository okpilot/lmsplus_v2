import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState } from 'react'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import type { QuizStateOpts } from '../../session-types'
import type { DraftAnswer } from '../../types'
import { assembleQuizState } from './quiz-state-assembly'
import { useAnswerPipeline } from './use-answer-pipeline'
import { useConnectionState } from './use-connection-state'
import { useExamPipeline } from './use-exam-state'
import { useProgressSync } from './use-progress-sync'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const isExam = opts.mode === 'exam'
  const router = useRouter()
  const sync = useProgressSync(opts)
  const { nav, currentIndexRef } = sync
  const [studyAnswers, setStudyAnswers] = useState<Map<string, DraftAnswer>>(() =>
    opts.initialAnswers ? new Map(Object.entries(opts.initialAnswers)) : new Map(),
  )
  const studyAnswersRef = useRef(studyAnswers)
  studyAnswersRef.current = studyAnswers
  const question = opts.questions[nav.currentIndex]
  const questionId = question?.id ?? ''
  const getQId = () => questionId
  const getStart = () => nav.answerStartTime.current

  const exam = useExamPipeline({
    quizOpts: opts,
    getQuestionId: getQId,
    getAnswerStartTime: getStart,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    navigate: nav.navigate,
    onAnswerRecorded: sync.saveAnswer,
  })
  const study = useAnswerPipeline({
    ...opts,
    getQuestionId: getQId,
    getAnswerStartTime: getStart,
    getCurrentIndex: () => nav.currentIndex,
    answers: studyAnswers,
    setAnswers: setStudyAnswers,
    answersRef: studyAnswersRef,
    currentIndexRef,
    navigateTo: nav.navigateTo,
    router,
  })

  const p = isExam ? exam : study
  const answers = isExam ? exam.answers : studyAnswers
  const initialSize = useRef(opts.initialAnswers ? Object.keys(opts.initialAnswers).length : 0)
  const { pending } = useConnectionState()
  const hasUnsavedStudy = !isExam && answers.size > initialSize.current && !p.submitted.current
  useNavigationGuard(hasUnsavedStudy || pending > 0)
  const questionIds = useMemo(() => opts.questions.map((q) => q.id), [opts.questions])

  return assembleQuizState({
    nav,
    question,
    questionId,
    answers,
    questionIds,
    pinnedQuestions: sync.pinnedQuestions,
    togglePin: () => sync.togglePin(questionId),
    saveError: sync.saveError,
    p,
    isExam,
    examMode: opts.examMode,
  })
}
