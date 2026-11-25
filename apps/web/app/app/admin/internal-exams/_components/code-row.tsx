'use client'

import Link from 'next/link'
import { StatusText } from '@/components/kit/status-text'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatUtc } from '@/lib/utils/format-utc'
import { codeRowVoidable } from '../_void-policy'
import { SITTING_BASE } from '../sittings/types'
import type { InternalExamCodeRow } from '../types'
import { statusLabel } from './code-status-items'
import { SendCodeEmailButton } from './send-code-email-button'

type DisplayStatus = InternalExamCodeRow['status'] | 'finished' | 'discarded'

function displayStatus(row: InternalExamCodeRow): DisplayStatus {
  if (row.status !== 'consumed') return row.status
  if (row.sessionEndedAt) return 'finished'
  // Soft-deleted and never ended: the attempt is gone, not running. Reporting it as "In progress"
  // leaves the admin watching a row that will never finish and that `codeRowVoidable` won't void.
  if (row.sessionDeletedAt) return 'discarded'
  return 'consumed'
}

const STATUS_MUTED: ReadonlySet<DisplayStatus> = new Set(['expired', 'voided', 'discarded'])

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return formatUtc(iso, { dateStyle: 'short', timeStyle: 'short' }, { label: false })
}

function isVoidDisabled(r: InternalExamCodeRow): boolean {
  if (r.status === 'voided') return true
  return r.status === 'consumed' && r.sessionEndedAt !== null
}

export function CodeRow({
  r,
  onVoid,
}: Readonly<{ r: InternalExamCodeRow; onVoid: (id: string) => void }>) {
  const ds = displayStatus(r)
  return (
    <TableRow>
      <TableCell>
        <StatusText
          label={statusLabel(ds)}
          className={STATUS_MUTED.has(ds) ? 'text-muted-foreground' : undefined}
        />
      </TableCell>
      <TableCell className="font-medium tracking-code tabular-nums">{r.code}</TableCell>
      <TableCell>{r.studentName || r.studentEmail || '—'}</TableCell>
      <TableCell>
        {r.subjectName || '—'}
        {r.sittingId && (
          <Link
            href={`${SITTING_BASE}/${r.sittingId}`}
            prefetch={false}
            className="block text-caption text-muted-foreground underline"
          >
            Sitting code
          </Link>
        )}
      </TableCell>
      <TableCell className="text-caption text-muted-foreground">
        {formatAbsolute(r.issuedAt)}
      </TableCell>
      <TableCell className="text-caption text-muted-foreground">
        {formatAbsolute(r.expiresAt)}
      </TableCell>
      <TableCell>
        {/* Only an active code can be (re)emailed — the send action rejects
            consumed/voided/expired codes ('Code is no longer active'), so
            disable the button for every non-active code. */}
        {r.sittingEntryId === null && (
          <SendCodeEmailButton
            codeId={r.id}
            emailedAt={r.emailedAt}
            disabled={r.status !== 'active'}
          />
        )}
      </TableCell>
      <TableCell>
        {codeRowVoidable(r) && (
          <Button
            variant="outline"
            size="sm"
            disabled={isVoidDisabled(r)}
            onClick={() => onVoid(r.id)}
          >
            Void
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
