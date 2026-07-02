import { Check, X } from 'lucide-react'

type Props = {
  responseText: string | null
  canonicalAnswer: string | null
  isCorrect: boolean
}

// Renders a short_answer question's result: the student's typed answer compared
// against the canonical answer, with a correct/incorrect marker.
export function ShortAnswerReport({ responseText, canonicalAnswer, isCorrect }: Readonly<Props>) {
  const hasResponse = responseText !== null && responseText.trim().length > 0

  return (
    <div className="mt-1 space-y-1 text-xs">
      <div
        className={`flex items-center gap-1 ${isCorrect ? 'text-green-600' : 'text-destructive'}`}
      >
        <span className="font-medium">Your answer:</span>
        <span>{hasResponse ? responseText : '—'}</span>
        {isCorrect ? (
          <Check size={12} aria-hidden className="ml-1 shrink-0" />
        ) : (
          <X size={12} aria-hidden className="ml-1 shrink-0" />
        )}
      </div>
      {!isCorrect && canonicalAnswer && (
        <div className="flex items-center gap-1 text-green-600">
          <span className="font-medium">Expected:</span>
          <span>{canonicalAnswer}</span>
        </div>
      )}
    </div>
  )
}
