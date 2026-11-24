'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyDescription } from '@/components/ui/empty'
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import type { RosterRow, ShowValue, SittingStatus } from '../types'
import { PersonRow } from './person-row'

type Props = {
  sittingId: string
  sittingStatus: SittingStatus
  rows: readonly RosterRow[]
  editable: boolean
  q: string
  show: ShowValue
  onRemove: (ids: string[]) => void
}

function emptyText(q: string, show: ShowValue): string {
  if (q) return 'No match.'
  return show === 'all' ? 'No people yet.' : 'No one matches this filter.'
}

function Head({ rows, editable }: Readonly<Pick<Props, 'rows' | 'editable'>>) {
  const { rosterIds, setRosterPage } = useSittingUi()
  const pageIds = rows.filter((r) => !r.hasAttempt).map((r) => r.userId)
  const ticked = pageIds.filter((id) => rosterIds.includes(id)).length
  const all = pageIds.length > 0 && ticked === pageIds.length
  return (
    <TableHeader>
      <TableRow>
        {editable && (
          <TableHead className="w-10">
            <Checkbox
              aria-label={`Select all ${pageIds.length} selectable`}
              checked={all}
              disabled={pageIds.length === 0}
              indeterminate={ticked > 0 && !all}
              onCheckedChange={(c) => setRosterPage(pageIds, c === true)}
            />
          </TableHead>
        )}
        <TableHead className="w-10">
          <span className="sr-only">Show exams</span>
        </TableHead>
        <TableHead>Person</TableHead>
        <TableHead>Exams</TableHead>
        <TableHead>Status</TableHead>
        {editable && (
          <TableHead className="w-10">
            <span className="sr-only">More actions</span>
          </TableHead>
        )}
      </TableRow>
    </TableHeader>
  )
}

/** One row per person; the exams expand in place. The open set survives filters, not a page change (`key`). */
export function RosterTable({ rows, q, show, ...rest }: Readonly<Props>) {
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  if (rows.length === 0) {
    return (
      <div className="p-card text-center">
        <EmptyDescription>{emptyText(q, show)}</EmptyDescription>
      </div>
    )
  }
  return (
    <Table>
      <Head rows={rows} editable={rest.editable} />
      <TableBody>
        {rows.map((r) => (
          <PersonRow
            key={r.userId}
            sittingId={rest.sittingId}
            sittingStatus={rest.sittingStatus}
            row={r}
            editable={rest.editable}
            open={openIds.has(r.userId)}
            onToggle={() => toggle(r.userId)}
            onRemove={() => rest.onRemove([r.userId])}
          />
        ))}
      </TableBody>
    </Table>
  )
}
