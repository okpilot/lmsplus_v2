import { Heading } from '@/components/ui/heading'
import { formatUtc } from '@/lib/utils/format-utc'
import type { RemovedEntryRow } from '../types'

type Props = { rows: readonly RemovedEntryRow[]; total: number }

const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const

/** Exams removed automatically because the student passed; hidden when there are none. */
export function RemovedEntriesList({ rows, total }: Readonly<Props>) {
  if (rows.length === 0) return null
  return (
    <section className="space-y-stack" aria-label="Removed automatically">
      <Heading level={3}>Removed automatically ({total})</Heading>
      <ul className="text-caption">
        {rows.map((r) => (
          <li key={r.entryId}>
            {r.studentName.trim() || 'Unknown student'} · {r.subjectShort || 'Unknown subject'} ·
            passed {r.passedAt ? formatUtc(r.passedAt, DAY, { label: false }) : ''} ·{' '}
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
