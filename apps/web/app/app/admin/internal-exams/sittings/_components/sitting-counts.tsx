import { plural } from '../_utils/plural'
import type { SittingSummary } from '../types'

type Props = { summary: Pick<SittingSummary, 'candidates' | 'entries' | 'codesIssued'> }

export function SittingCounts({ summary }: Readonly<Props>) {
  return (
    <p className="text-body text-muted-foreground">
      {plural(summary.candidates, 'person', 'people')} · {plural(summary.entries, 'exam')} ·{' '}
      {plural(summary.codesIssued, 'code')} issued
    </p>
  )
}
