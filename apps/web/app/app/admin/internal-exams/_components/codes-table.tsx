'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InternalExamCodeRow, InternalExamCodeStatus } from '../types'
import { VoidCodeDialog } from './void-code-dialog'

type Props = { rows: InternalExamCodeRow[]; status?: InternalExamCodeStatus | 'finished' }

const STATUS_ITEMS = [
  { value: '__all__', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'consumed', label: 'In progress' },
  { value: 'finished', label: 'Finished' },
  { value: 'voided', label: 'Voided' },
  { value: 'expired', label: 'Expired' },
]

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

function CodeRow({ r, onVoid }: { r: InternalExamCodeRow; onVoid: (id: string) => void }) {
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

export function CodesTable({ rows, status }: Readonly<Props>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [voidId, setVoidId] = useState<string | null>(null)

  const onStatusChange = (value: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (value === null || value === '__all__') params.delete('status')
    else params.set('status', value)
    router.replace(`/app/admin/internal-exams?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      <Select value={status ?? '__all__'} onValueChange={onStatusChange} items={STATUS_ITEMS}>
        <SelectTrigger className="w-40" aria-label="Status filter">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="min-w-[140px]">Code</TableHead>
              <TableHead className="min-w-[160px]">Student</TableHead>
              <TableHead className="min-w-[140px]">Subject</TableHead>
              <TableHead className="w-40">Issued</TableHead>
              <TableHead className="w-40">Expires</TableHead>
              <TableHead className="w-24">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                  No codes found
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => <CodeRow key={r.id} r={r} onVoid={setVoidId} />)
            )}
          </TableBody>
        </Table>
      </div>

      <VoidCodeDialog
        codeId={voidId}
        open={voidId !== null}
        onOpenChange={(o) => !o && setVoidId(null)}
      />
    </div>
  )
}
