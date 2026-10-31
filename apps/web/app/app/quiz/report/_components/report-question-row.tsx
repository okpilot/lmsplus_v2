'use client'

import { Check, ChevronDown, ChevronUp, Flag, X } from 'lucide-react'
import { useState } from 'react'
import { MarkdownText } from '@/app/app/_components/markdown-text'
import { ZoomableImage } from '@/app/app/_components/zoomable-image'
import { InsetPanel } from '@/components/kit/inset-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import { isQuestionAnswered } from '@/lib/queries/report-question-answered'
import { formatMsDuration } from './format-duration'
import { ReportAnswerBody } from './report-answer-body'
import { useReportFlag } from './report-flag-context'

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function ReportQuestionRow({
  question,
  index,
}: Readonly<{
  question: QuizReportQuestion
  index: number
}>) {
  const [expanded, setExpanded] = useState(false)

  // Null on admin report views (no provider) — the flag toggle is student-only.
  const flag = useReportFlag()
  const isFlagged = flag?.isFlagged(question.questionId) ?? false
  const isFlagToggling = flag?.isToggling(question.questionId) ?? false

  const label = question.questionNumber ?? `Q${index + 1}`
  const hasExplanation = Boolean(question.explanationText || question.explanationImageUrl)
  const isAnswered = isQuestionAnswered(question)

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {question.isCorrect ? (
            <Badge role="img" aria-label="Correct" tone="success" shape="circle">
              <Check className="size-icon-sm stroke-icon-bold" aria-hidden />
            </Badge>
          ) : (
            <Badge role="img" aria-label="Incorrect" tone="danger" shape="circle">
              <X className="size-icon-sm stroke-icon-bold" aria-hidden />
            </Badge>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-caption-strong text-muted-foreground">{label}</span>
            <span className="text-body">{question.questionText}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <span className="text-caption text-muted-foreground">
                {formatMsDuration(question.responseTimeMs)}
              </span>
              {flag && (
                <Button
                  variant="toggle"
                  size="icon-sm"
                  type="button"
                  data-testid="report-flag-button"
                  onClick={() => {
                    // Guards programmatic invocation; pointer clicks are also blocked by
                    // `disabled:pointer-events-none`. HTML `disabled` is not a behavioral contract.
                    if (!isFlagToggling) flag.toggle(question.questionId)
                  }}
                  aria-pressed={isFlagged}
                  aria-label={isFlagged ? 'Unflag question' : 'Flag question'}
                  disabled={isFlagToggling}
                >
                  <Flag
                    aria-hidden
                    className={
                      isFlagged ? 'size-icon-sm fill-caution text-caution' : 'size-icon-sm'
                    }
                  />
                </Button>
              )}
            </div>
          </div>

          {question.questionImageUrl && (
            <div className="mt-2">
              <ZoomableImage
                src={question.questionImageUrl}
                alt="Question illustration"
                className="max-h-64"
              />
            </div>
          )}

          {!isAnswered && <p className="mt-1 text-caption text-muted-foreground">Not answered</p>}

          <ReportAnswerBody question={question} />

          {hasExplanation && (
            <div className="mt-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
              >
                {expanded ? 'Hide explanation' : 'Show explanation'}
                {expanded ? (
                  <ChevronUp className="size-icon-sm" aria-hidden />
                ) : (
                  <ChevronDown className="size-icon-sm" aria-hidden />
                )}
              </Button>

              {expanded && (
                <InsetPanel data-testid="explanation-panel" className="mt-2 space-y-2">
                  {question.explanationImageUrl && (
                    <ZoomableImage
                      src={question.explanationImageUrl}
                      alt="Explanation illustration"
                      className="max-h-48"
                    />
                  )}
                  {question.explanationText && (
                    <MarkdownText className="text-body text-muted-foreground">
                      {question.explanationText}
                    </MarkdownText>
                  )}
                </InsetPanel>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
