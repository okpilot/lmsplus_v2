'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/app/app/_components/session-timer'
import { ThemeToggle } from '@/app/app/_components/theme-toggle'
import { type QuizMode as DbQuizMode, MODE_LABELS } from '@/lib/constants/exam-modes'
import { ExamCountdownTimer } from '../../_components/exam-countdown-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import { endDiscovery } from '../../actions/end-discovery'
import { ExamBadge } from './exam-session-header'
import { KeyboardLegend } from './keyboard-legend'

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
}: QuizSessionHeaderProps) {
  const router = useRouter()
  const finishLabel = isExam ? `Finish ${MODE_LABELS[examMode ?? 'mock_exam']}` : 'Finish Test'

  // Best-effort teardown of the active discovery row, then leave the runner.
  // Awaited so the Server Action settles before the terminal nav and cannot cancel
  // the soft-nav (code-style.md §6); we navigate regardless of its outcome.
  async function handleDiscoveryExit() {
    await endDiscovery().catch(() => {})
    router.replace('/app/quiz')
  }
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
        {/* Keyboard shortcuts are pointer-with-keyboard only → desktop. */}
        <div className="hidden md:block">
          <KeyboardLegend isExam={isExam} />
        </div>
        <ThemeToggle />
        {isDiscovery ? (
          <button
            type="button"
            // replace (not push): the consumed handoff makes the session page
            // un-resumable, so Back must not be able to reopen the exited runner.
            onClick={handleDiscoveryExit}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Exit
          </button>
        ) : (
          <button
            type="button"
            onClick={onFinishClick}
            disabled={submitting}
            aria-busy={submitting || undefined}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="inline-flex items-center justify-center gap-2">
              {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              {finishLabel}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
