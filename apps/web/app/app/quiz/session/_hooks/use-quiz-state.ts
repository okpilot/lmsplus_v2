import { useMemo } from 'react'
import type { QuizStateOpts } from '../../session-types'
import { assembleQuizState } from './quiz-state-assembly'
import { useExamPipeline } from './use-exam-state'
import { useProgressSync } from './use-progress-sync'
import { useStudyPipeline } from './use-study-pipeline'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const isExam = opts.mode === 'exam'
  const sync = useProgressSync(opts)
  const { nav, currentIndexRef } = sync
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
  const { pipeline: study, answers: studyAnswers } = useStudyPipeline(opts, sync, {
    getQuestionId: getQId,
    getAnswerStartTime: getStart,
  })

  const p = isExam ? exam : study
  const answers = isExam ? exam.answers : studyAnswers
  const questionIds = useMemo(() => opts.questions.map((q) => q.id), [opts.questions])

  return assembleQuizState({
    feedback: p.feedback,
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
