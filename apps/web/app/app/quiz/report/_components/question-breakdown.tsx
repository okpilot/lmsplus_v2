'use client'

import { useState } from 'react'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { ReportQuestionRow } from './report-question-row'

const PAGE_SIZE = 5

type Props = Readonly<{ questions: QuizReportQuestion[] }>

export function QuestionBreakdown({ questions }: Props) {
  const [showAll, setShowAll] = useState(false)

  const total = questions.length
  const collapsed = total > PAGE_SIZE
  const visible = showAll || !collapsed ? total : PAGE_SIZE
  const displayed = questions.slice(0, visible)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Question Breakdown</h2>
        <span className="text-sm text-muted-foreground">{total} questions</span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {displayed.map((q, i) => (
          <div
            key={q.questionId}
            className={i < displayed.length - 1 ? 'border-b border-border' : ''}
          >
            <ReportQuestionRow question={q} index={i} />
          </div>
        ))}
      </div>

      {collapsed && (
        <div className="flex flex-col items-center gap-1">
          {!showAll && (
            <p className="text-xs text-muted-foreground">
              Showing {visible} of {total} questions
            </p>
          )}
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="text-sm text-primary hover:underline"
          >
            {showAll ? 'Show fewer' : `Show all ${total} questions`}
          </button>
        </div>
      )}
    </div>
  )
}
