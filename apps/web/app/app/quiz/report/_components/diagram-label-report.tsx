import { Check, X } from 'lucide-react'
import type { DiagramZoneResult } from '@/lib/queries/quiz-report'

type Props = Readonly<{
  zones: DiagramZoneResult[]
  correctCount: number
  totalZones: number
}>

// Renders a diagram_label question's per-zone result. Leads with the partial
// fraction (X/N zones correct), then lists each zone's placed label vs the
// correct label. 3-state: fully correct / partial / none correct. Mirrors
// OrderingReport's structure (per-slot -> per-zone).
export function DiagramLabelReport({ zones, correctCount, totalZones }: Props) {
  const allCorrect = totalZones > 0 && correctCount === totalZones
  const noneCorrect = correctCount === 0

  let fractionClass = 'text-amber-600'
  if (allCorrect) fractionClass = 'text-green-600'
  else if (noneCorrect) fractionClass = 'text-destructive'

  return (
    <div className="mt-1 space-y-1 text-xs">
      <p className={`font-medium ${fractionClass}`}>
        {correctCount} / {totalZones} zone{totalZones === 1 ? '' : 's'} correct
      </p>
      <ul className="space-y-0.5">
        {zones.map((zone) => (
          <li
            key={zone.blankIndex}
            className={`flex items-center gap-1 ${zone.isCorrect ? 'text-green-600' : 'text-destructive'}`}
          >
            <span className="font-medium">Zone {zone.blankIndex + 1}:</span>
            <span>
              {zone.placedLabel && zone.placedLabel.trim().length > 0 ? zone.placedLabel : '—'}
            </span>
            {/* Row-level aria-label (report-question-row) only announces the
                question's OVERALL state; this conveys each zone's result to
                screen readers, mirroring ordering-report's per-slot status. */}
            <span className="sr-only">{zone.isCorrect ? 'Correct' : 'Incorrect'}</span>
            {zone.isCorrect ? (
              <Check size={12} aria-hidden className="ml-1 shrink-0" />
            ) : (
              <>
                <X size={12} aria-hidden className="ml-1 shrink-0" />
                {zone.correctLabel && (
                  <span className="text-green-600">(correct: {zone.correctLabel})</span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
