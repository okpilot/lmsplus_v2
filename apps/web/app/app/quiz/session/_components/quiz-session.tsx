'use client'

import { useMemo } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import { QuestionGrid } from '../../_components/question-grid'
import type { DraftAnswer } from '../../types'
import { useFlaggedQuestions } from '../_hooks/use-flagged-questions'
import { useQuizActiveTab } from '../_hooks/use-quiz-active-tab'
import { useQuizState } from '../_hooks/use-quiz-state'
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

  if (!s.question) return null

  return (
    <div className="flex flex-1 flex-col">
      <QuestionGrid
        totalQuestions={props.questions.length}
        currentIndex={s.currentIndex}
        pinnedIds={s.pinnedQuestions}
        flaggedIds={flaggedIds}
        questionIds={s.questionIds}
        feedbackMap={feedbackMap}
        onNavigate={s.navigateTo}
      />
      <QuizMainPanel
        s={s}
        totalQuestions={props.questions.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userId={props.userId}
        isFlagged={isFlagged(s.questionId)}
        onToggleFlag={() => toggleFlag(s.questionId)}
      />
    </div>
  )
}
