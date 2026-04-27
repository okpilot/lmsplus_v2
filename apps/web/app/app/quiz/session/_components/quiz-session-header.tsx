'use client'

import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import { ExamBadge } from './exam-session-header'

type QuizSessionHeaderProps = {
  isExam: boolean
  currentIndex: number
  totalQuestions: number
  submitting: boolean
  timeLimitSeconds?: number
  timerStart: number
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
  onTimeExpired: () => void
  onFinishClick: () => void
}

export function QuizSessionHeader({
  isExam,
  currentIndex,
  totalQuestions,
  submitting,
  timeLimitSeconds,
  timerStart,
  activeTab,
  onTabChange,
  onTimeExpired,
  onFinishClick,
}: QuizSessionHeaderProps) {
  return (
    <div className="relative flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium md:hidden">
          Q {currentIndex + 1} / {totalQuestions}
        </span>
        {isExam ? (
          <>
            <ExamBadge />
            {timeLimitSeconds && (
              <ExamCountdownTimer
                timeLimitSeconds={timeLimitSeconds}
                startedAt={timerStart}
                onExpired={onTimeExpired}
                className="text-sm md:hidden"
              />
            )}
          </>
        ) : (
          <SessionTimer className="text-sm text-muted-foreground md:hidden" />
        )}
      </div>
      {!isExam && (
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <div className="pointer-events-auto">
            <QuestionTabs activeTab={activeTab} onTabChange={onTabChange} />
          </div>
        </div>
      )}
      <div className="hidden md:block" />
      <div className="z-10 flex items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={onFinishClick}
          disabled={submitting}
          className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isExam ? 'Finish Practice Exam' : 'Finish Test'}
        </button>
      </div>
    </div>
  )
}
