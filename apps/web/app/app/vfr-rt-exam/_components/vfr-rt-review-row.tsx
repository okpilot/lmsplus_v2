import { Check, X } from 'lucide-react'
import { MarkdownText } from '@/app/app/_components/markdown-text'
import { ZoomableImage } from '@/app/app/_components/zoomable-image'
import type { VfrRtReviewRow as VfrRtReviewRowType } from '@/lib/queries/vfr-rt-results'
import { VfrRtReviewDialog } from './vfr-rt-review-dialog'
import { VfrRtReviewMc } from './vfr-rt-review-mc'
import { VfrRtReviewShort } from './vfr-rt-review-short'

type Props = {
  row: VfrRtReviewRowType
  index: number
}

export function VfrRtReviewRow({ row, index }: Props) {
  const hasExplanation = Boolean(row.explanationText || row.explanationImageUrl)

  return (
    <div className={`px-4 py-3 ${row.isCorrect ? '' : 'bg-red-50 dark:bg-red-950/20'}`}>
      <div className="flex items-start gap-3">
        {/* ✓/✗ badge */}
        <div className="mt-0.5 flex-shrink-0">
          {row.isCorrect ? (
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
            <span className="text-xs font-medium text-muted-foreground">Q{index + 1}</span>
            <span className="text-sm">{row.questionText}</span>
          </div>

          {row.questionImageUrl && (
            <div className="mt-2">
              <ZoomableImage
                src={row.questionImageUrl}
                alt="Question illustration"
                className="max-h-64"
              />
            </div>
          )}

          <div className="mt-2">
            {row.questionType === 'short_answer' && (
              <VfrRtReviewShort answers={row.answers} reviewKey={row.key} />
            )}
            {row.questionType === 'multiple_choice' && (
              <VfrRtReviewMc answers={row.answers} reviewKey={row.key} options={row.options} />
            )}
            {row.questionType === 'dialog_fill' && (
              <VfrRtReviewDialog answers={row.answers} reviewKey={row.key} />
            )}
          </div>

          {hasExplanation && (
            <div className="mt-3 space-y-2 rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Explanation</p>
              {row.explanationImageUrl && (
                <ZoomableImage
                  src={row.explanationImageUrl}
                  alt="Explanation illustration"
                  className="max-h-48"
                />
              )}
              {row.explanationText && (
                <MarkdownText className="text-sm text-muted-foreground">
                  {row.explanationText}
                </MarkdownText>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
