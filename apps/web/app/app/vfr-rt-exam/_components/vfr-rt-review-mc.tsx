import { Check, X } from 'lucide-react'
import type { VfrRtResultAnswer, VfrRtResultKey } from '@/lib/queries/vfr-rt-results'

type Props = {
  answers: VfrRtResultAnswer[]
  reviewKey: VfrRtResultKey
  options: { id: string; text: string }[] | null
}

export function VfrRtReviewMc({ answers, reviewKey, options }: Props) {
  const selectedId = answers[0]?.selected_option_id ?? null

  if (options) {
    return (
      <ul className="mt-1 space-y-0.5">
        {options.map((opt, i) => {
          const letter = String.fromCodePoint(65 + i)
          const isCorrect = opt.id === reviewKey.correct_option_id
          const isSelected = opt.id === selectedId
          const rowClass = isCorrect
            ? 'flex items-center gap-1 text-xs text-green-600'
            : isSelected
              ? 'flex items-center gap-1 text-xs text-destructive'
              : 'flex items-center gap-1 text-xs text-muted-foreground'
          return (
            <li key={opt.id} className={rowClass}>
              <span className="font-medium">{letter}</span>
              <span>—</span>
              <span>{opt.text}</span>
              {isCorrect && <Check size={12} aria-hidden className="ml-1 flex-shrink-0" />}
              {isCorrect && !isSelected && <span>Correct</span>}
              {isSelected && !isCorrect && (
                <X size={12} aria-hidden className="ml-1 flex-shrink-0" />
              )}
              {isSelected && !isCorrect && <span>Your answer</span>}
              {isCorrect && isSelected && <span>Correct · Your answer</span>}
            </li>
          )
        })}
      </ul>
    )
  }

  // Fallback when options are unavailable (mig 105 RPC failed)
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-medium text-muted-foreground">You answered: </span>
        <span className="text-destructive">{selectedId ?? '—'}</span>
      </p>
      <p>
        <span className="font-medium text-muted-foreground">Correct: </span>
        <span className="text-green-600">{reviewKey.correct_option_id ?? '—'}</span>
      </p>
    </div>
  )
}
