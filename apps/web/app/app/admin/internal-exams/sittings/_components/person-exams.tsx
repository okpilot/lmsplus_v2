import { CardList } from '@/components/ui/card'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatTitleDate } from '../_utils/format-dates'
import { sharedExpiry } from '../_utils/person-rollup'
import type { RosterRow } from '../types'
import { PersonExamItem } from './person-exam-item'

type Props = {
  sittingId: string
  person: RosterRow
  editable: boolean
  /** Every column of the table. */
  span: number
}

/** The expanded row under a person: validity line, then one card row per exam. */
export function PersonExams({ sittingId, person: r, editable, span }: Readonly<Props>) {
  const expiry = sharedExpiry(r.entries)
  return (
    <TableRow id={`detail-${r.userId}`}>
      <TableCell colSpan={span} className="whitespace-normal">
        {r.entries.length === 0 ? (
          <p className="text-muted-foreground">No exams yet.</p>
        ) : (
          <div className="space-y-stack-sm">
            {expiry && (
              <p className="text-caption text-muted-foreground">
                Codes valid until {formatTitleDate(expiry)}
              </p>
            )}
            <CardList>
              {r.entries.map((e) => (
                <PersonExamItem
                  key={e.entryId}
                  sittingId={sittingId}
                  personName={r.name || r.email}
                  deactivated={r.deactivated}
                  entry={e}
                  editable={editable}
                  sharedExpiry={expiry !== null}
                />
              ))}
            </CardList>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}
