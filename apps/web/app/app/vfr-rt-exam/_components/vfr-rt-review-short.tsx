import type { VfrRtResultAnswer, VfrRtResultKey } from '@/lib/queries/vfr-rt-results'

type Props = {
  answers: VfrRtResultAnswer[]
  reviewKey: VfrRtResultKey
}

export function VfrRtReviewShort({ answers, reviewKey }: Props) {
  const answer = answers[0]
  const isCorrect = answer?.is_correct ?? false

  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="font-medium text-muted-foreground">Your answer: </span>
        <span className={isCorrect ? 'text-green-600' : 'text-destructive'}>
          {answer?.response_text ?? '—'}
        </span>
      </p>
      <p>
        <span className="font-medium text-muted-foreground">Correct answer: </span>
        <span className="text-green-600">{reviewKey.canonical_answer ?? '—'}</span>
      </p>
      {reviewKey.accepted_synonyms && reviewKey.accepted_synonyms.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also accepted: {reviewKey.accepted_synonyms.join(', ')}
        </p>
      )}
    </div>
  )
}
