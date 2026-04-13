'use client'

import { useCallback, useRef } from 'react'
import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import type { SessionQuestion } from '@/app/app/_types/session'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import { FinishQuizDialog } from '../../_components/finish-quiz-dialog'
import { QuestionGrid } from '../../_components/question-grid'
import { QuestionTabs } from '../../_components/question-tabs'
import type { AnswerFeedback, DraftAnswer } from '../../types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizState } from '../_hooks/use-quiz-state'
import { useQuizUI } from '../_hooks/use-quiz-ui'
import { QuizControls } from './quiz-controls'
import { QuizMainPanel } from './quiz-main-panel'

type QuizSessionProps = {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialFeedback?: Map<string, AnswerFeedback>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
  mode?: 'study' | 'exam'
  timeLimitSeconds?: number
  passMark?: number
}

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  const { flaggedIds, isFlagged, toggleFlag, isToggling } = useFlaggedQuestions(s.questionIds)
  const { feedbackMap, pendingOptionId, handleSelectionChange, canSubmitAnswer } = useQuizUI({
    feedback: s.feedback,
    currentIndex: s.currentIndex,
    activeTab: s.isExam ? 'question' : activeTab,
    existingAnswer: s.existingAnswer,
  })

  const timerStartRef = useRef(Date.now())
  const autoSubmitFiredRef = useRef(false)

  // Auto-submit: show finish dialog with timeout flag
  const handleTimeExpired = useCallback(() => {
    if (autoSubmitFiredRef.current || s.submitting) return
    autoSubmitFiredRef.current = true
    s.setShowFinishDialog(true)
  }, [s.submitting, s.setShowFinishDialog])

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <div className="relative flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium md:hidden">
            Q {s.currentIndex + 1} / {props.questions.length}
          </span>
          {s.isExam ? (
            <>
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                EXAM
              </span>
              {props.timeLimitSeconds && (
                <ExamCountdownTimer
                  timeLimitSeconds={props.timeLimitSeconds}
                  startedAt={timerStartRef.current}
                  onExpired={handleTimeExpired}
                  className="text-sm"
                />
              )}
            </>
          ) : (
            <SessionTimer className="text-sm text-muted-foreground md:hidden" />
          )}
        </div>

        {/* Desktop tabs — hidden in exam mode */}
        {!s.isExam && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
            <div className="pointer-events-auto">
              <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          </div>
        )}

        <div className="hidden md:block" />
        <div className="z-10 flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => s.setShowFinishDialog(true)}
            disabled={s.submitting}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {s.isExam ? 'Finish Exam' : 'Finish Test'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-4">
          <QuestionGrid
            totalQuestions={props.questions.length}
            currentIndex={s.currentIndex}
            pinnedIds={s.pinnedQuestions}
            flaggedIds={flaggedIds}
            questionIds={s.questionIds}
            feedbackMap={s.isExam ? new Map() : feedbackMap}
            answeredIds={s.isExam ? s.answeredIds : undefined}
            isExamMode={s.isExam}
            onNavigate={s.navigateTo}
          />

          {/* Mobile tabs — hidden in exam mode */}
          {!s.isExam && (
            <div className="md:hidden">
              <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          )}

          {/* Info bar */}
          <div className="flex items-center justify-between text-sm">
            <span className="hidden font-medium md:inline">
              Question {s.currentIndex + 1} of {props.questions.length}
            </span>
            {s.isExam ? (
              props.timeLimitSeconds && (
                <ExamCountdownTimer
                  timeLimitSeconds={props.timeLimitSeconds}
                  startedAt={timerStartRef.current}
                  onExpired={handleTimeExpired}
                  className="hidden text-sm md:inline"
                />
              )
            ) : (
              <span className="hidden md:inline">
                <SessionTimer className="text-sm" />
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {s.question.question_number ? `No. ${s.question.question_number}` : '\u00A0'}
            </span>
          </div>

          {/* Tab content — exam forces question tab */}
          <QuizMainPanel
            s={s}
            activeTab={s.isExam ? 'question' : activeTab}
            userId={props.userId}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>

      {/* Action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom)] md:px-8">
        <div className="mx-auto max-w-3xl">
          <QuizControls
            isPinned={s.isPinned}
            isFlagged={isFlagged(s.questionId)}
            currentIndex={s.currentIndex}
            totalQuestions={props.questions.length}
            submitting={s.submitting}
            showSubmit={canSubmitAnswer}
            flagLoading={isToggling(s.questionId)}
            onTogglePin={s.togglePin}
            onToggleFlag={() => toggleFlag(s.questionId)}
            onPrev={() => s.navigate(-1)}
            onNext={() => s.navigate(1)}
            onSubmitAnswer={async () => {
              if (pendingOptionId) {
                await s.handleSelectAnswer(pendingOptionId)
              }
            }}
            isExam={s.isExam}
          />
        </div>
      </div>

      {/* Finish dialog */}
      <FinishQuizDialog
        open={s.showFinishDialog}
        answeredCount={s.answeredCount}
        totalQuestions={props.questions.length}
        submitting={s.submitting}
        error={s.error}
        onSubmit={s.handleSubmit}
        onCancel={() => s.setShowFinishDialog(false)}
        onSave={s.handleSave}
        onDiscard={s.handleDiscard}
        isExam={s.isExam}
        timeExpired={autoSubmitFiredRef.current}
      />
    </div>
  )
}
