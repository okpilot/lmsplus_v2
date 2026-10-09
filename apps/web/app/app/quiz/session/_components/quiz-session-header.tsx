'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { QuestionTab } from '../../_components/question-tabs'
import { DesktopTabs, HeaderControls, HeaderStatus } from './quiz-session-header-parts'

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
  /** Discovery only: opens the Stay / Leave confirm. */
  onExitClick?: () => void
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
  onExitClick,
  initialActiveMs,
}: Readonly<QuizSessionHeaderProps>) {
  return (
    // Desktop (md+) only: pin the header so it stays visible while the question
    // body scrolls underneath. Mobile keeps the original scroll-away header.
    // `md:sticky` is a positioned value, so the `absolute inset-0` desktop tab
    // overlay still anchors to this element. NOTE: md:sticky relies on no
    // `overflow: hidden/auto/clip` on any scroll-container ancestor — if a parent
    // gains an overflow value, the header will silently stop pinning.
    <div className="relative flex items-center justify-between border-b border-border px-4 py-2 md:sticky md:top-0 md:z-30 md:bg-background/90 md:backdrop-blur-sm">
      <HeaderStatus
        isExam={isExam}
        examMode={examMode}
        currentIndex={currentIndex}
        totalQuestions={totalQuestions}
        timeLimitSeconds={timeLimitSeconds}
        timerStart={timerStart}
        onTimeExpired={onTimeExpired}
        initialActiveMs={initialActiveMs}
      />
      {!isExam && <DesktopTabs activeTab={activeTab} onTabChange={onTabChange} />}
      <div className="hidden md:block" />
      <HeaderControls
        isExam={isExam}
        isDiscovery={isDiscovery}
        examMode={examMode}
        submitting={submitting}
        onFinishClick={onFinishClick}
        onExitClick={onExitClick}
      />
    </div>
  )
}
