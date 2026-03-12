'use client'

import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { SessionSummary } from '@/app/app/_components/session-summary'
import { SessionTimer } from '@/app/app/_components/session-timer'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { batchSubmitQuiz } from '../../actions/batch-submit'
import { deleteDraft, saveDraft } from '../../actions/draft'
import type { BatchSubmitResult, DraftAnswer } from '../../types'
import { QuizNavBar } from './quiz-nav-bar'

type StoredAnswer = { selectedOptionId: string; responseTimeMs: number }
type SuccessResult = BatchSubmitResult & { success: true }
type QuizSessionProps = {
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
}

export function QuizSession({
  sessionId,
  questions,
  initialAnswers,
  initialIndex,
}: QuizSessionProps) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(initialIndex ?? 0)
  const [answers, setAnswers] = useState<Map<string, StoredAnswer>>(() => {
    if (!initialAnswers) return new Map()
    return new Map(Object.entries(initialAnswers))
  })
  const answerStartTime = useRef(Date.now())
  const [showFinishDialog, setShowFinishDialog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SuccessResult | null>(null)

  useNavigationGuard(answers.size > 0 && !result)

  const question = questions[currentIndex]
  if (!question) return null
  // Captured after guard — safe to use in closures below
  const questionId = question.id

  if (result) {
    return (
      <SessionSummary
        totalQuestions={result.totalQuestions}
        correctCount={result.correctCount}
        scorePercentage={result.scorePercentage}
        mode="quick_quiz"
      />
    )
  }

  const answeredCount = answers.size
  const existingAnswer = answers.get(questionId)

  function handleSelectAnswer(optionId: string) {
    const elapsed = Date.now() - answerStartTime.current
    setAnswers((prev) => {
      const next = new Map(prev)
      next.set(questionId, { selectedOptionId: optionId, responseTimeMs: elapsed })
      return next
    })
  }

  function navigate(delta: number) {
    const next = currentIndex + delta
    if (next >= 0 && next < questions.length) {
      setCurrentIndex(next)
      answerStartTime.current = Date.now()
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const answerArray = Array.from(answers.entries()).map(([questionId, a]) => ({
      questionId,
      selectedOptionId: a.selectedOptionId,
      responseTimeMs: a.responseTimeMs,
    }))
    try {
      const submitResult = await batchSubmitQuiz({ sessionId, answers: answerArray })
      if (!submitResult.success) {
        setError(submitResult.error)
        setSubmitting(false)
        return
      }
      setShowFinishDialog(false)
      setResult(submitResult)
      // Clean up any saved draft after successful submit
      deleteDraft().catch(() => {})
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleSave() {
    setSubmitting(true)
    setError(null)
    const answerObj = Object.fromEntries(answers)
    const result = await saveDraft({
      sessionId,
      questionIds: questions.map((q) => q.id),
      answers: answerObj,
      currentIndex,
    })
    if (result.success) {
      router.push('/app/quiz')
    } else {
      setError(result.error)
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            data-testid="progress-bar"
            className="h-1.5 rounded-full bg-primary transition-all"
            style={{ width: `${(answeredCount / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {answeredCount}/{questions.length}
        </span>
        <SessionTimer />
      </div>
      <QuestionCard
        questionText={question.question_text}
        questionImageUrl={question.question_image_url}
        questionNumber={currentIndex + 1}
        totalQuestions={questions.length}
        dbQuestionNumber={question.question_number}
      />
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <AnswerOptions
        options={question.options}
        onSubmit={handleSelectAnswer}
        disabled={submitting}
        selectedOptionId={existingAnswer?.selectedOptionId ?? null}
      />
      <QuizNavBar
        currentIndex={currentIndex}
        totalQuestions={questions.length}
        onPrev={() => navigate(-1)}
        onNext={() => navigate(1)}
        onFinish={() => setShowFinishDialog(true)}
      />
      <FinishQuizDialog
        open={showFinishDialog}
        answeredCount={answeredCount}
        totalQuestions={questions.length}
        submitting={submitting}
        onSubmit={handleSubmit}
        onCancel={() => setShowFinishDialog(false)}
        onSave={handleSave}
      />
    </div>
  )
}
