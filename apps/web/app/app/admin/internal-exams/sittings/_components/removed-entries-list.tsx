import { Heading } from '@/components/ui/heading'
import { fmtDate } from '../_utils/format-dates'
import type { RemovedEntryRow } from '../types'

type Props = { rows: readonly RemovedEntryRow[]; total: number }

/** Exams removed automatically because the student passed; hidden when there are none. */
export function RemovedEntriesList({ rows, total }: Readonly<Props>) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-stack" aria-label="Removed automatically">
      <Heading level={3}>Removed automatically ({total})</Heading>
      <ul className="text-caption">
        {rows.map((r) => (
          <li key={r.entryId}>
            {r.studentName.trim() || 'Unknown student'} · {r.subjectShort || 'Unknown subject'} ·{' '}
            {r.passedAt ? `passed ${fmtDate(r.passedAt)} · ` : ''}
            {r.noticeSent ? 'notice sent' : 'notice pending'}
          </li>
        ))}
      </ul>
      {total > rows.length && (
        <p className="text-caption text-muted-foreground">
          Showing {rows.length} of {total}
        </p>
      )}
    </section>
  )
}
