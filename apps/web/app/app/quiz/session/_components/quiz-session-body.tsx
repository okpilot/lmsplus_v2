'use client'

import { QuestionTabs } from '../../_components/question-tabs'
import type { QuizSessionProps } from '../../session-types'
import type { useQuizSession } from '../_hooks/use-quiz-session'
import { QuizQuestionCard } from './quiz-question-card'
import { QuizSessionGrid } from './quiz-session-grid'
import { QuizSessionLayout } from './quiz-session-layout'

type QuizSessionBodyProps = {
  props: Readonly<QuizSessionProps>
  session: ReturnType<typeof useQuizSession>
}

/** The question card beside the navigator panel. */
export function QuizSessionBody({ props, session }: Readonly<QuizSessionBodyProps>) {
  const { s, isDiscovery, ui, flags, highlightedOptionId } = session
  const total = props.questions.length
  return (
    <div className="px-gutter py-section">
      <QuizSessionLayout
        tabs={
          !s.isExam && (
            <div className="lg:hidden">
              <QuestionTabs activeTab={ui.activeTab} onTabChange={ui.setActiveTab} />
            </div>
          )
        }
        question={
          <QuizQuestionCard
            s={s}
            activeTab={ui.effectiveTab}
            userId={props.userId}
            totalQuestions={total}
            examMode={props.examMode}
            isFlagged={flags.isFlagged(s.questionId)}
            flagLoading={flags.isToggling(s.questionId)}
            onToggleFlag={() => flags.toggleFlag(s.questionId)}
            pendingOptionId={ui.pendingOptionId}
            onSelectionChange={ui.handleSelectionChange}
            keyboardHighlightedId={highlightedOptionId}
          />
        }
        panel={
          <QuizSessionGrid
            s={s}
            isDiscovery={isDiscovery}
            totalQuestions={total}
            flaggedIds={flags.flaggedIds}
            feedbackMap={ui.feedbackMap}
          />
        }
      />
    </div>
  )
}
