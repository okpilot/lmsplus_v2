'use client'

import type { QuizMode as DbQuizMode } from '@/lib/constants/exam-modes'
import type { QuestionTab } from '../../_components/question-tabs'
import type { SessionMode } from '../../session-types'
import { DesktopTabs, HeaderControls, ModeHeading } from './quiz-session-header-parts'

type QuizSessionHeaderProps = {
  isExam: boolean
  /** Discovery is browse-only: the Finish button becomes an Exit that leaves the runner. */
  isDiscovery?: boolean
  examMode?: DbQuizMode
  mode?: SessionMode
  subjectName?: string
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
  mode,
  subjectName,
  activeTab,
  onTabChange,
  ...rest
}: Readonly<QuizSessionHeaderProps>) {
  const { isExam, examMode } = rest
  return (
    // Pins from md so the header stays visible while the question scrolls beneath it.
    // `md:sticky` is a positioned value, so the `absolute inset-0` desktop tab overlay
    // still anchors to this element. NOTE: md:sticky relies on no
    // `overflow: hidden/auto/clip` on any scroll-container ancestor — if a parent
    // gains an overflow value, the header will silently stop pinning.
    <div className="relative flex items-center justify-between gap-3 border-b border-border bg-background px-gutter py-2 md:sticky md:top-0 md:z-nav">
      <ModeHeading isExam={isExam} examMode={examMode} mode={mode} subjectName={subjectName} />
      {!isExam && <DesktopTabs activeTab={activeTab} onTabChange={onTabChange} />}
      <HeaderControls {...rest} />
    </div>
  )
}
