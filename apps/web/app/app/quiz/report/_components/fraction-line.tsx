import { CircleDashed } from 'lucide-react'
import { FRACTION_TEXT, fractionTone } from './fraction-tone'

type Props = {
  correct: number
  total: number
  noun: string
}

// Partial-credit fraction line shared by the per-type reports.
export function FractionLine({ correct, total, noun }: Readonly<Props>) {
  const tone = fractionTone(correct, total)

  return (
    <p className={`flex items-center gap-1 font-medium ${FRACTION_TEXT[tone]}`}>
      {tone === 'partial' && <CircleDashed className="size-icon-sm text-caution" aria-hidden />}
      {correct} / {total} {noun}
      {total === 1 ? '' : 's'} correct
    </p>
  )
}
