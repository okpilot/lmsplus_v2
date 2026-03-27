'use client'

import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useState } from 'react'
import { MarkdownText } from '@/app/app/_components/markdown-text'
import { ZoomableImage } from '@/app/app/_components/zoomable-image'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'

function formatResponseTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function optionLetter(options: { id: string; text: string }[], optionId: string): string {
  const idx = options.findIndex((o) => o.id === optionId)
  if (idx === -1) return ''
  return String.fromCodePoint(65 + idx)
}

export function ReportQuestionRow({
  question,
  index,
}: {
  question: QuizReportQuestion
  index: number
}) {
  const [expanded, setExpanded] = useState(false)

  const selectedOption = question.options.find((o) => o.id === question.selectedOptionId)
  const correctOption = question.options.find((o) => o.id === question.correctOptionId)
  const label = question.questionNumber ?? `Q${index + 1}`
  const selectedLetter = question.selectedOptionId
    ? optionLetter(question.options, question.selectedOptionId)
    : ''
  const correctLetter = question.correctOptionId
    ? optionLetter(question.options, question.correctOptionId)
    : ''

  const hasExplanation = Boolean(question.explanationText || question.explanationImageUrl)

  return (
    <div className={`px-4 py-3 ${question.isCorrect ? '' : 'bg-red-50 dark:bg-red-950/20'}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {question.isCorrect ? (
            <span
              role="img"
              aria-label="Correct"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30"
            >
              <Check size={14} strokeWidth={2.5} aria-hidden />
            </span>
          ) : (
            <span
              role="img"
              aria-label="Incorrect"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-destructive dark:bg-red-900/30"
            >
              <X size={14} strokeWidth={2.5} aria-hidden />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="text-sm">{question.questionText}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
              {formatResponseTime(question.responseTimeMs)}
            </span>
          </div>

          <div className="mt-1 space-y-0.5 text-xs">
            <p className={question.isCorrect ? 'text-green-600' : 'text-destructive'}>
              Your answer:{' '}
              {selectedLetter ? `${selectedLetter} — ${selectedOption?.text ?? ''}` : 'No answer'}
            </p>
            {!question.isCorrect && correctOption && (
              <p className="text-green-600">
                Correct answer: {correctLetter} — {correctOption.text}
              </p>
            )}
          </div>

          {hasExplanation && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                aria-expanded={expanded}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? 'Hide explanation' : 'Show explanation'}
                {expanded ? (
                  <ChevronUp size={14} aria-hidden />
                ) : (
                  <ChevronDown size={14} aria-hidden />
                )}
              </button>

              {expanded && (
                <div
                  data-testid="explanation-panel"
                  className="mt-2 space-y-2 rounded-lg bg-muted/50 p-3"
                >
                  {question.explanationImageUrl && (
                    <ZoomableImage
                      src={question.explanationImageUrl}
                      alt="Explanation illustration"
                      className="max-h-48"
                    />
                  )}
                  {question.explanationText && (
                    <MarkdownText className="text-sm text-muted-foreground">
                      {question.explanationText}
                    </MarkdownText>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
