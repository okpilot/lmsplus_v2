import { Check, X } from 'lucide-react'
import type { OrderingSlotResult } from '@/lib/queries/quiz-report'

type Props = {
  slots: OrderingSlotResult[]
  correctCount: number
  totalItems: number
}

// Renders an ordering question's per-slot result. Leads with the partial
// fraction (X/N positions correct), then lists each slot's placed item vs the
// canonical. 3-state: fully correct / partial / none correct.
export function OrderingReport({ slots, correctCount, totalItems }: Props) {
  const allCorrect = totalItems > 0 && correctCount === totalItems
  const noneCorrect = correctCount === 0

  let fractionClass = 'text-amber-600'
  if (allCorrect) fractionClass = 'text-green-600'
  else if (noneCorrect) fractionClass = 'text-destructive'

  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className={`font-medium ${fractionClass}`}>
        {correctCount} / {totalItems} position{totalItems === 1 ? '' : 's'} correct
      </p>
      <ul className="space-y-0.5">
        {slots.map((slot) => (
          <li
            key={slot.position}
            className={`flex items-center gap-1 ${slot.isCorrect ? 'text-green-600' : 'text-destructive'}`}
          >
            <span className="font-medium">Position {slot.position + 1}:</span>
            <span>
              {slot.responseText && slot.responseText.trim().length > 0 ? slot.responseText : '—'}
            </span>
            {/* Row-level aria-label (report-question-row) only announces the
                question's OVERALL state; this conveys each slot's result to
                screen readers, mirroring dialog-fill-report's per-blank status. */}
            <span className="sr-only">{slot.isCorrect ? 'Correct' : 'Incorrect'}</span>
            {slot.isCorrect ? (
              <Check size={12} aria-hidden className="ml-1 shrink-0" />
            ) : (
              <>
                <X size={12} aria-hidden className="ml-1 shrink-0" />
                {slot.canonicalText && (
                  <span className="text-green-600">(correct: {slot.canonicalText})</span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
