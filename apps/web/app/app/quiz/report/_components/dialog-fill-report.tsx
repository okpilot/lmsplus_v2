import { Check, X } from 'lucide-react'
import type { DialogFillBlankResult } from '@/lib/queries/quiz-report'
import { FractionLine } from './fraction-line'

type Props = {
  blanks: DialogFillBlankResult[]
  correctCount: number
  totalBlanks: number
}

// Renders a dialog_fill question's per-blank result. Leads with the partial
// fraction (X/N blanks correct), then lists each blank's student answer vs the
// canonical. 3-state: fully correct / partial / none correct.
export function DialogFillReport({ blanks, correctCount, totalBlanks }: Readonly<Props>) {
  return (
    <div className="mt-1 space-y-1 text-caption">
      <FractionLine correct={correctCount} total={totalBlanks} noun="blank" />
      <ul className="space-y-0.5">
        {blanks.map((blank) => (
          <li
            key={blank.index}
            className={`flex items-center gap-1 ${blank.isCorrect ? 'text-success' : 'text-danger'}`}
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
              <Check aria-hidden className="ml-1 size-icon-sm shrink-0" />
            ) : (
              <>
                <X aria-hidden className="ml-1 size-icon-sm shrink-0" />
                {blank.canonical && (
                  <span className="text-success">(expected: {blank.canonical})</span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
