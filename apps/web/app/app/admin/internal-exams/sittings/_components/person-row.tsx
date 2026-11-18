'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import { RowMenu } from '@/components/admin/row-menu'
import { StatusText } from '@/components/kit/status-text'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MenuItem, MenuSeparator } from '@/components/ui/menu'
import { TableCell, TableRow } from '@/components/ui/table'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { personNeedsCode } from '../_utils/person-rollup'
import { plural } from '../_utils/plural'
import { rowStatus } from '../_utils/row-status'
import type { RosterRow, SittingStatus } from '../types'
import { PersonExams } from './person-exams'

type Props = {
  sittingId: string
  sittingStatus: SittingStatus
  row: RosterRow
  editable: boolean
  open: boolean
  onToggle: () => void
  onRemove: () => void
}

function ExamsCell({ row }: Readonly<{ row: RosterRow }>) {
  if (row.entries.length === 0) {
    return <span className="text-caption text-muted-foreground">No exams</span>
  }
  return (
    <>
      <span className="lg:hidden">{plural(row.entries.length, 'exam')}</span>
      <span className="hidden lg:inline">{row.entries.map((e) => e.subjectShort).join(', ')}</span>
    </>
  )
}

function StatusCell({ row, sittingStatus }: Readonly<Pick<Props, 'row' | 'sittingStatus'>>) {
  // The Exams cell already says "No exams".
  const hide = row.entries.length === 0 && !row.deactivated
  const status = hide
    ? null
    : rowStatus({ sittingStatus, deactivated: row.deactivated, entries: row.entries })
  return (
    <TableCell className="whitespace-normal">
      {status && <StatusText label={status.label} tone={status.tone} caption={status.caption} />}
    </TableCell>
  )
}

/** ⋯ menu: Add exams, Issue codes (needs a code, active person), Remove (nobody who took an exam). */
function RowActions({
  row,
  name,
  onRemove,
}: Readonly<Pick<Props, 'row' | 'onRemove'> & { name: string }>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, isRefreshing } = useSittingUi()
  const ids = { ids: row.userId }
  return (
    <RowMenu label={`Actions for ${name}`} triggerRef={triggerRef}>
      <MenuItem disabled={isRefreshing} onClick={() => open('exams', triggerRef.current, ids)}>
        Add exams
      </MenuItem>
      {personNeedsCode(row.entries) && !row.deactivated && (
        <MenuItem disabled={isRefreshing} onClick={() => open('issue', triggerRef.current, ids)}>
          Issue codes
        </MenuItem>
      )}
      {!row.hasAttempt && (
        <>
          <MenuSeparator />
          <MenuItem tone="danger" onClick={onRemove}>
            Remove from sitting
          </MenuItem>
        </>
      )}
    </RowMenu>
  )
}

/** One person: tick, disclosure, name, subject codes, one status, ⋯; the exams expand below. */
export function PersonRow({
  sittingId,
  sittingStatus,
  row,
  editable,
  open,
  onToggle,
  onRemove,
}: Readonly<Props>) {
  const { rosterIds, selectAll, toggleRoster } = useSittingUi()
  const name = row.name || row.email
  const ticked = selectAll || rosterIds.includes(row.userId)
  return (
    <>
      <TableRow data-state={ticked ? 'selected' : undefined} className="align-top">
        {editable && (
          <TableCell>
            <Checkbox
              aria-label={`Select ${name}`}
              checked={ticked}
              disabled={row.hasAttempt && !rosterIds.includes(row.userId)}
              onCheckedChange={() => toggleRoster(row.userId)}
            />
          </TableCell>
        )}
        <TableCell>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={open}
            aria-controls={open ? `detail-${row.userId}` : undefined}
            aria-label={`${open ? 'Hide' : 'Show'} exams for ${name}`}
            onClick={onToggle}
          >
            {open ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-normal">
          <div className="font-medium">{name}</div>
          <div className="text-caption text-muted-foreground">{row.email}</div>
        </TableCell>
        <TableCell className="whitespace-normal">
          <ExamsCell row={row} />
        </TableCell>
        <StatusCell row={row} sittingStatus={sittingStatus} />
        {editable && (
          <TableCell className="text-right">
            <RowActions row={row} name={name} onRemove={onRemove} />
          </TableCell>
        )}
      </TableRow>
      {open && (
        <PersonExams
          sittingId={sittingId}
          person={row}
          editable={editable}
          span={editable ? 6 : 4}
        />
      )}
    </>
  )
}
