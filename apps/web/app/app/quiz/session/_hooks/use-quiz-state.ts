import { useRouter } from 'next/navigation'
import type { QuizStateOpts } from '../../session-types'
import { assembleQuizState } from './quiz-state-assembly'
import { useAnswerPipeline } from './use-answer-pipeline'
import { useExamPipeline } from './use-exam-state'
import { useProgressSync } from './use-progress-sync'
import { useQuizStateExtras } from './use-quiz-state-extras'
import { useStudyAnswers } from './use-study-answers'

export type QuizState = ReturnType<typeof useQuizState>

export function useQuizState(opts: QuizStateOpts) {
  const isExam = opts.mode === 'exam'
  const router = useRouter()
  const sync = useProgressSync(opts)
  const { nav, currentIndexRef } = sync
  const { studyAnswers, setStudyAnswers, studyAnswersRef } = useStudyAnswers(opts.initialAnswers)
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
  const { questionIds, feedback } = useQuizStateExtras({ opts, isExam, questionId, answers, p })

  return assembleQuizState({
    feedback,
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
