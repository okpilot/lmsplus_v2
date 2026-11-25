import { Heading } from '@/components/ui/heading'
import { formatListDate, formatTitleDate } from '../_utils/format-dates'
import type { RosterRow } from '../types'

type Props = { person: RosterRow; scheduledAt: string }

/** One person's live codes, as a printable card. */
export function PrintCodesCard({ person, scheduledAt }: Readonly<Props>) {
  return (
    <section className="break-inside-avoid rounded-card border p-card">
      <Heading level={3}>{person.name || person.email}</Heading>
      <p className="text-caption text-muted-foreground">{formatTitleDate(scheduledAt)}</p>
      <table className="mt-stack w-full text-body">
        <thead>
          <tr className="text-left text-caption text-muted-foreground">
            <th className="font-normal">Exam</th>
            <th className="font-normal">Code</th>
            <th className="font-normal">Valid until (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {person.entries.map((e) => (
            <tr key={e.entryId}>
              <td>{e.subjectShort}</td>
              <td className="font-medium tracking-code">{e.code}</td>
              <td>{e.codeExpiresAt ? formatListDate(e.codeExpiresAt) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
