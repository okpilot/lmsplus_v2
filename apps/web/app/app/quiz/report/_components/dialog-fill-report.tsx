import { Check, X } from 'lucide-react'
import type { DialogFillBlankResult } from '@/lib/queries/quiz-report'

type Props = {
  blanks: DialogFillBlankResult[]
  correctCount: number
  totalBlanks: number
}

// Renders a dialog_fill question's per-blank result. Leads with the partial
// fraction (X/N blanks correct), then lists each blank's student answer vs the
// canonical. 3-state: fully correct / partial / none correct.
export function DialogFillReport({ blanks, correctCount, totalBlanks }: Props) {
  const allCorrect = totalBlanks > 0 && correctCount === totalBlanks
  const noneCorrect = correctCount === 0

  let fractionClass = 'text-amber-600'
  if (allCorrect) fractionClass = 'text-green-600'
  else if (noneCorrect) fractionClass = 'text-destructive'

  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className={`font-medium ${fractionClass}`}>
        {correctCount} / {totalBlanks} blank{totalBlanks === 1 ? '' : 's'} correct
      </p>
      <ul className="space-y-0.5">
        {blanks.map((blank) => (
          <li
            key={blank.index}
            className={`flex items-center gap-1 ${blank.isCorrect ? 'text-green-600' : 'text-destructive'}`}
          >
            <span className="font-medium">Blank {blank.index + 1}:</span>
            <span>
              {blank.responseText && blank.responseText.trim().length > 0
                ? blank.responseText
                : '—'}
            </span>
            {/* Row-level aria-label (report-question-row) only announces the
                question's OVERALL state; this conveys each blank's result to
                screen readers, mirroring options-list's per-item status text. */}
            <span className="sr-only">{blank.isCorrect ? 'Correct' : 'Incorrect'}</span>
            {blank.isCorrect ? (
              <Check size={12} aria-hidden className="ml-1 shrink-0" />
            ) : (
              <>
                <X size={12} aria-hidden className="ml-1 shrink-0" />
                {blank.canonical && (
                  <span className="text-green-600">(expected: {blank.canonical})</span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
