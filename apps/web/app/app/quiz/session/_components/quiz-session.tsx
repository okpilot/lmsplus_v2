'use client'

import { useMemo } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import { QuestionGrid } from '../../_components/question-grid'
import type { DraftAnswer } from '../../types'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizState } from '../_hooks/use-quiz-state'
import { QuizMainPanel } from './quiz-main-panel'

type QuizSessionProps = {
  sessionId: string
  questions: SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
}

// Stable empty set to avoid new reference every render (wired to DB flags in PR 5)
const EMPTY_SET = new Set<string>()

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)

  // Derive a simple isCorrect map for the grid, memoized on feedback identity
  const feedbackMap = useMemo(() => {
    const map = new Map<string, { isCorrect: boolean }>()
    for (const [qId, fb] of s.feedback) {
      map.set(qId, { isCorrect: fb.isCorrect })
    }
    return map
  }, [s.feedback])

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      <QuestionGrid
        totalQuestions={props.questions.length}
        currentIndex={s.currentIndex}
        pinnedIds={s.pinnedQuestions}
        flaggedIds={EMPTY_SET}
        questionIds={s.questionIds}
        feedbackMap={feedbackMap}
        onNavigate={s.navigateTo}
      />
      <QuizMainPanel
        s={s}
        totalQuestions={props.questions.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  )
}
