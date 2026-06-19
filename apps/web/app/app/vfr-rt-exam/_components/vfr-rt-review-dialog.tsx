import type { VfrRtResultAnswer, VfrRtResultKey } from '@/lib/queries/vfr-rt-results'

type Props = {
  answers: VfrRtResultAnswer[]
  reviewKey: VfrRtResultKey
}

export function VfrRtReviewDialog({ answers, reviewKey }: Props) {
  const blanks = reviewKey.blanks ?? []

  return (
    <ul className="space-y-1">
      {blanks.map((blank) => {
        const answerRow = answers.find((a) => a.blank_index === blank.index)
        const isCorrect = answerRow?.is_correct ?? false

        return (
          <li key={blank.index} className="text-sm">
            <span className="font-medium text-muted-foreground">Blank {blank.index + 1}: </span>
            <span className={isCorrect ? 'text-green-600' : 'text-destructive'}>
              {answerRow?.response_text ?? '—'}
            </span>
            <span className="text-muted-foreground"> / correct: </span>
            <span className="text-green-600">{blank.canonical}</span>
            {blank.synonyms.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                (also: {blank.synonyms.join(', ')})
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
