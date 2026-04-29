'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InternalExamHistoryEntry } from '../queries'

type Props = { rows: InternalExamHistoryEntry[] }

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

function formatScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) return '—'
  return `${Math.round(score)}%`
}

export function MyReportsTab({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="reports-empty"
      >
        No internal exam attempts yet.
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[140px]">Subject</TableHead>
            <TableHead className="w-16">Attempt</TableHead>
            <TableHead className="w-40">Started</TableHead>
            <TableHead className="w-40">Ended</TableHead>
            <TableHead className="w-20">Score</TableHead>
            <TableHead className="w-24">Result</TableHead>
            <TableHead className="w-24">Answered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <ReportRow key={r.id} row={r} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ReportRow({ row: r }: { row: InternalExamHistoryEntry }) {
  const router = useRouter()
  const href = `/app/internal-exam/report?session=${r.id}`
  const label = r.subjectName || r.subjectShort || '—'
  const navigate = () => router.push(href)

  return (
    <TableRow
      data-testid={`report-row-${r.id}`}
      tabIndex={0}
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
      className="cursor-pointer hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <TableCell>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-foreground no-underline focus-visible:underline"
        >
          {label}
        </Link>
      </TableCell>
      <TableCell className="tabular-nums">#{r.attemptNumber}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatAbsolute(r.startedAt)}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatAbsolute(r.endedAt)}</TableCell>
      <TableCell className="font-mono text-sm">{formatScore(r.scorePercentage)}</TableCell>
      <TableCell>
        {r.passed === null ? (
          <span className="text-muted-foreground">—</span>
        ) : r.passed ? (
          <Badge variant="default" aria-label="Passed">
            Pass
          </Badge>
        ) : (
          <Badge variant="destructive" aria-label="Failed">
            Fail
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-xs tabular-nums">
        {r.answeredCount}/{r.totalQuestions}
      </TableCell>
    </TableRow>
  )
}
