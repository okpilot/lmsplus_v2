'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import type { SessionQuestion } from '@/app/app/_types/session'
import { QuestionGrid } from '../../_components/question-grid'
import { QuestionTabs } from '../../_components/question-tabs'
import type { DraftAnswer } from '../../types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizState } from '../_hooks/use-quiz-state'
import { QuizControls } from './quiz-controls'
import { QuizMainPanel } from './quiz-main-panel'

type QuizSessionProps = {
  userId: string
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
}

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  const { flaggedIds, isFlagged, toggleFlag } = useFlaggedQuestions(s.questionIds)

  const feedbackMap = useMemo(() => {
    const map = new Map<string, { isCorrect: boolean }>()
    for (const [qId, fb] of s.feedback) {
      map.set(qId, { isCorrect: fb.isCorrect })
    }
    return map
  }, [s.feedback])

  // Track selected option for mobile footer submit button
  const [pendingOptionId, setPendingOptionId] = useState<string | null>(null)
  const handleSelectionChange = useCallback((id: string | null) => setPendingOptionId(id), [])

  // Clear pending selection when navigating to a different question.
  // currentIndex is read to trigger the effect — the value itself is unused.
  const currentIndex = s.currentIndex
  useEffect(() => {
    void currentIndex
    setPendingOptionId(null)
  }, [currentIndex])

  if (!s.question) return null

  const isQuestionTab = activeTab === 'question'
  const canSubmitAnswer = isQuestionTab && !s.existingAnswer && !!pendingOptionId

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <div className="relative flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium md:hidden">
          Q {s.currentIndex + 1} / {props.questions.length}
        </span>
        <SessionTimer className="text-sm text-muted-foreground md:hidden" />
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <div className="pointer-events-auto">
            <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>
        </div>
        <div className="hidden md:block" />
        <div className="z-10 flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => s.setShowFinishDialog(true)}
            disabled={s.submitting}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Finish Test
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          data-testid="progress-bar"
          className="h-1 bg-primary transition-all"
          style={{ width: `${(s.answeredCount / props.questions.length) * 100}%` }}
        />
      </div>

      {/* Content — normal flow, scrolls with the page */}
      <div className="px-4 pt-4 pb-32 md:px-8 md:pb-8">
        <div className="mx-auto max-w-3xl space-y-4">
          <QuestionGrid
            totalQuestions={props.questions.length}
            currentIndex={s.currentIndex}
            pinnedIds={s.pinnedQuestions}
            flaggedIds={flaggedIds}
            questionIds={s.questionIds}
            feedbackMap={feedbackMap}
            onNavigate={s.navigateTo}
          />

          {/* Mobile tabs (below grid) */}
          <div className="md:hidden">
            <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Info bar */}
          <div className="flex items-center justify-between text-sm">
            <span className="hidden font-medium md:inline">
              Question {s.currentIndex + 1} of {props.questions.length}
            </span>
            <span className="hidden md:inline">
              <SessionTimer className="text-sm" />
            </span>
            <span className="text-xs text-muted-foreground">
              {s.question.question_number ? `No. ${s.question.question_number}` : '\u00A0'}
            </span>
          </div>

          {/* Tab content */}
          <QuizMainPanel
            s={s}
            activeTab={activeTab}
            userId={props.userId}
            onSelectionChange={handleSelectionChange}
          />

          {/* Desktop action bar — in content flow */}
          <div className="hidden md:block">
            <QuizControls
              isPinned={s.isPinned}
              isFlagged={isFlagged(s.questionId)}
              currentIndex={s.currentIndex}
              totalQuestions={props.questions.length}
              answeredCount={s.answeredCount}
              submitting={s.submitting}
              showFinishDialog={s.showFinishDialog}
              showSubmit={false}
              onTogglePin={s.togglePin}
              onToggleFlag={() => toggleFlag(s.questionId)}
              onPrev={() => s.navigate(-1)}
              onNext={() => s.navigate(1)}
              onSubmit={s.handleSubmit}
              onCancel={() => s.setShowFinishDialog(false)}
              onSave={s.handleSave}
              onDiscard={s.handleDiscard}
            />
          </div>
        </div>
      </div>

      {/* Mobile action bar — fixed at bottom */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom)] md:hidden">
        <QuizControls
          isPinned={s.isPinned}
          isFlagged={isFlagged(s.questionId)}
          currentIndex={s.currentIndex}
          totalQuestions={props.questions.length}
          answeredCount={s.answeredCount}
          submitting={s.submitting}
          showFinishDialog={false}
          showSubmit={canSubmitAnswer}
          onTogglePin={s.togglePin}
          onToggleFlag={() => toggleFlag(s.questionId)}
          onPrev={() => s.navigate(-1)}
          onNext={() => s.navigate(1)}
          onSubmit={() => {
            if (pendingOptionId) {
              s.handleSelectAnswer(pendingOptionId)
              setPendingOptionId(null)
            }
          }}
          onCancel={() => s.setShowFinishDialog(false)}
          onSave={s.handleSave}
          onDiscard={s.handleDiscard}
        />
      </div>
    </div>
  )
}
