'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import type { InternalExamCodeRow } from '../types'
import { SendCodeEmailButton } from './send-code-email-button'

function displayStatus(row: InternalExamCodeRow): string {
  if (row.status === 'consumed' && row.sessionEndedAt) return 'finished'
  return row.status
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  consumed: 'secondary',
  finished: 'default',
  voided: 'destructive',
  expired: 'outline',
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
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
        <Badge variant={STATUS_VARIANT[ds] ?? 'outline'} className="text-xs capitalize">
          {ds}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-sm">{r.code}</TableCell>
      <TableCell>{r.studentName || r.studentEmail || '—'}</TableCell>
      <TableCell>{r.subjectName || '—'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatAbsolute(r.issuedAt)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatAbsolute(r.expiresAt)}</TableCell>
      <TableCell>
        {/* Only an active code can be (re)emailed — the send action rejects
            consumed/voided/expired codes ('Code is no longer active'), so
            disable the button for every non-active code. */}
        <SendCodeEmailButton
          codeId={r.id}
          emailedAt={r.emailedAt}
          disabled={r.status !== 'active'}
        />
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          disabled={isVoidDisabled(r)}
          onClick={() => onVoid(r.id)}
        >
          Void
        </Button>
      </TableCell>
    </TableRow>
  )
}
