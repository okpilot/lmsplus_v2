'use client'

import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import type { SessionQuestion } from '@/app/app/_components/session-runner'
import { SessionTimer } from '@/app/app/_components/session-timer'
import { useEffect, useState } from 'react'
import { CommentsTab } from '../../_components/comments-tab'
import { ExplanationTab } from '../../_components/explanation-tab'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { QuestionGrid } from '../../_components/question-grid'
import { QuestionTabs } from '../../_components/question-tabs'
import { StatisticsTab } from '../../_components/statistics-tab'
import type { DraftAnswer } from '../../types'
import { useQuizState } from '../_hooks/use-quiz-state'
import { QuizNavBar } from './quiz-nav-bar'

type QuizSessionProps = {
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
}

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props) // draftId forwarded via props spread
  const [activeTab, setActiveTab] = useState<
    'question' | 'explanation' | 'comments' | 'statistics'
  >('question')

  // Reset tab to 'question' when navigating between questions — not data fetching
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on index change
  useEffect(() => {
    setActiveTab('question')
  }, [s.currentIndex])

  if (!s.question) return null

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="shrink-0 md:w-48">
        <QuestionGrid
          totalQuestions={props.questions.length}
          currentIndex={s.currentIndex}
          answeredIds={s.answeredIds}
          flaggedIds={s.flaggedQuestions}
          questionIds={s.questionIds}
          onNavigate={s.navigateTo}
        />
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-muted">
            <div
              data-testid="progress-bar"
              className="h-1.5 rounded-full bg-primary transition-all"
              style={{ width: `${(s.answeredCount / props.questions.length) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {s.answeredCount}/{props.questions.length}
          </span>
          <SessionTimer />
        </div>
        <QuestionCard
          questionText={s.question.question_text}
          questionImageUrl={s.question.question_image_url}
          questionNumber={s.currentIndex + 1}
          totalQuestions={props.questions.length}
          dbQuestionNumber={s.question.question_number}
        />
        {s.error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {s.error}
          </div>
        )}
        <AnswerOptions
          options={s.question.options}
          onSubmit={s.handleSelectAnswer}
          disabled={s.submitting}
          selectedOptionId={s.existingAnswer?.selectedOptionId ?? null}
          correctOptionId={s.currentFeedback?.correctOptionId ?? null}
        />
        <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === 'explanation' &&
          (s.currentFeedback ? (
            <ExplanationTab
              hasAnswered={true}
              isCorrect={s.currentFeedback.isCorrect}
              explanationText={s.currentFeedback.explanationText}
              explanationImageUrl={s.currentFeedback.explanationImageUrl}
            />
          ) : (
            <ExplanationTab hasAnswered={false} questionId={s.questionId} />
          ))}
        {activeTab === 'comments' && <CommentsTab />}
        {activeTab === 'statistics' && (
          <StatisticsTab questionId={s.questionId} hasAnswered={!!s.existingAnswer} />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="flag-button"
            onClick={s.toggleFlag}
            className={
              s.isFlagged
                ? 'rounded-lg border border-yellow-400 bg-yellow-100 px-3 py-2 text-sm font-medium text-yellow-700 transition-colors dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted'
            }
            aria-pressed={s.isFlagged}
          >
            {s.isFlagged ? 'Unflag' : 'Flag'}
          </button>
          <div className="flex-1">
            <QuizNavBar
              currentIndex={s.currentIndex}
              totalQuestions={props.questions.length}
              onPrev={() => s.navigate(-1)}
              onNext={() => s.navigate(1)}
              onFinish={() => s.setShowFinishDialog(true)}
            />
          </div>
        </div>
        <FinishQuizDialog
          open={s.showFinishDialog}
          answeredCount={s.answeredCount}
          totalQuestions={props.questions.length}
          submitting={s.submitting}
          onSubmit={s.handleSubmit}
          onCancel={() => s.setShowFinishDialog(false)}
          onSave={s.handleSave}
        />
      </div>
    </div>
  )
}
