'use client'

import Link from 'next/link'
import { StatusText } from '@/components/kit/status-text'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { formatUtc } from '@/lib/utils/format-utc'
import {
  type CodeDisplayStatus,
  codeDisplayStatus,
  codeRowVoidable,
  codeVoidDisabled,
} from '../_void-policy'
import { SITTING_BASE } from '../sittings/types'
import type { InternalExamCodeRow } from '../types'
import { statusLabel } from './code-status-items'
import { SendCodeEmailButton } from './send-code-email-button'

const STATUS_MUTED: ReadonlySet<CodeDisplayStatus> = new Set<CodeDisplayStatus>([
  'expired',
  'voided',
  'discarded',
])

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return formatUtc(iso, { dateStyle: 'short', timeStyle: 'short' }, { label: false })
}

export function CodeRow({
  r,
  onVoid,
}: Readonly<{ r: InternalExamCodeRow; onVoid: (id: string) => void }>) {
  const ds = codeDisplayStatus(r)
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
            // Every row's link reads "Sitting code", so a link list cannot tell them apart. The
            // label STARTS with the visible text, which keeps the visible string inside the
            // accessible name (WCAG 2.5.3 Label in Name).
            aria-label={`Sitting code ${r.code}`}
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
        {/* An active code, or a sitting code not yet opened ('waiting'), can be (re)emailed;
            the send action rejects every other state. */}
        <SendCodeEmailButton
          codeId={r.id}
          emailedAt={r.emailedAt}
          disabled={r.status !== 'active' && r.status !== 'waiting'}
        />
      </TableCell>
      <TableCell>
        {codeRowVoidable(r) && (
          <Button
            variant="outline"
            size="sm"
            disabled={codeVoidDisabled(r)}
            onClick={() => onVoid(r.id)}
          >
            Void
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
