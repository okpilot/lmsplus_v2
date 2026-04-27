'use client'

import { useCallback, useRef, useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
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
import { QuizSessionHeader } from './quiz-session-header'
import { QuizSessionMetaRow } from './quiz-session-meta-row'

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
  const effectiveTab = s.isExam ? 'question' : activeTab
  const { feedbackMap, pendingOptionId, handleSelectionChange, canSubmitAnswer } = useQuizUI({
    feedback: s.feedback,
    currentIndex: s.currentIndex,
    activeTab: effectiveTab,
    existingAnswer: s.existingAnswer,
  })

  const timerStartRef = useRef(Date.now())
  const autoSubmitFiredRef = useRef(false)
  const [timeExpired, setTimeExpired] = useState(false)
  const handleTimeExpired = useCallback(() => {
    if (autoSubmitFiredRef.current) return
    autoSubmitFiredRef.current = true
    setTimeExpired(true)
    s.setShowFinishDialog(true)
  }, [s.setShowFinishDialog])

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      <QuizSessionHeader
        isExam={s.isExam}
        currentIndex={s.currentIndex}
        totalQuestions={props.questions.length}
        submitting={s.submitting}
        timeLimitSeconds={props.timeLimitSeconds}
        timerStart={timerStartRef.current}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTimeExpired={handleTimeExpired}
        onFinishClick={() => s.setShowFinishDialog(true)}
      />

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
          {!s.isExam && (
            <div className="md:hidden">
              <QuestionTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          )}
          <QuizSessionMetaRow
            isExam={s.isExam}
            currentIndex={s.currentIndex}
            totalQuestions={props.questions.length}
            questionNumber={s.question.question_number ?? null}
            timeLimitSeconds={props.timeLimitSeconds}
            timerStart={timerStartRef.current}
            onTimeExpired={handleTimeExpired}
          />
          <QuizMainPanel
            s={s}
            activeTab={effectiveTab}
            userId={props.userId}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      </div>

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
              if (pendingOptionId) await s.handleSelectAnswer(pendingOptionId)
            }}
            isExam={s.isExam}
          />
        </div>
      </div>

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
        timeExpired={timeExpired}
      />
    </div>
  )
}
