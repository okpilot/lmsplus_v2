'use client'

import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import { ExamBadge } from './exam-session-header'
import { KeyboardLegend } from './keyboard-legend'
import { QuizHeaderAction } from './quiz-header-action'

type QuizSessionHeaderProps = {
  isExam: boolean
  /** Discovery is browse-only: the Finish button becomes an Exit that leaves the runner. */
  isDiscovery?: boolean
  examMode?: DbQuizMode
  currentIndex: number
  totalQuestions: number
  submitting: boolean
  timeLimitSeconds?: number
  timerStart: number
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
  onTimeExpired: () => void
  onFinishClick: () => void
  /** Active time already spent (ms); the untimed clock continues from it. */
  initialActiveMs?: number
}

export function QuizSessionHeader({
  isExam,
  isDiscovery,
  examMode,
  currentIndex,
  totalQuestions,
  submitting,
  timeLimitSeconds,
  timerStart,
  activeTab,
  onTabChange,
  onTimeExpired,
  onFinishClick,
  initialActiveMs,
}: Readonly<QuizSessionHeaderProps>) {
  return (
    // Desktop (md+) only: pin the header so it stays visible while the question
    // body scrolls underneath. Mobile keeps the original scroll-away header.
    // `md:sticky` is a positioned value, so the `absolute inset-0` desktop tab
    // overlay below still anchors to this element. NOTE: md:sticky relies on no
    // `overflow: hidden/auto/clip` on any scroll-container ancestor — if a parent
    // gains an overflow value, the header will silently stop pinning.
    <div className="relative flex items-center justify-between border-b border-border px-4 py-2 md:sticky md:top-0 md:z-30 md:bg-background/90 md:backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium md:hidden">
          Q {currentIndex + 1} / {totalQuestions}
        </span>
        {isExam ? (
          <>
            <ExamBadge mode={examMode} />
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
          <SessionTimer
            className="text-sm text-muted-foreground md:hidden"
            initialElapsedMs={initialActiveMs}
          />
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
        {/* Keyboard shortcuts are pointer-with-keyboard only → desktop. */}
        <div className="hidden md:block">
          <KeyboardLegend isExam={isExam} />
        </div>
        <ThemeToggle />
        <QuizHeaderAction
          isExam={isExam}
          isDiscovery={isDiscovery}
          examMode={examMode}
          submitting={submitting}
          onFinishClick={onFinishClick}
        />
      </div>
    </div>
  )
}
