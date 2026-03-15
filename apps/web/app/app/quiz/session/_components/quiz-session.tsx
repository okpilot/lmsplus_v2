'use client'

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

export function QuizSession(props: QuizSessionProps) {
  const s = useQuizState(props)
  const { activeTab, setActiveTab } = useQuizActiveTab(s.currentIndex)
  if (!s.question) return null

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="shrink-0 md:w-48">
        <QuestionGrid
          totalQuestions={props.questions.length}
          currentIndex={s.currentIndex}
          answeredIds={s.answeredIds}
          pinnedIds={s.pinnedQuestions}
          questionIds={s.questionIds}
          onNavigate={s.navigateTo}
        />
      </div>
      <QuizMainPanel
        s={s}
        totalQuestions={props.questions.length}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  )
}
