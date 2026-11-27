'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { PassFailStatus } from '@/components/kit/status-text'
import { EmptyDescription } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCorrectFraction } from '@/lib/utils/format-correct-fraction'
import { formatUtc } from '@/lib/utils/format-utc'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { PaginationBar } from '../../../_components/pagination-bar'
import { SITTING_BASE } from '../sittings/types'
import type { InternalExamAttemptRow } from '../types'

type Props = {
  rows: InternalExamAttemptRow[]
  totalCount: number
  pageSize: number
}

const FILTER_KEYS = ['q', 'subject', 'sitting', 'group']

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return formatUtc(iso, { dateStyle: 'short', timeStyle: 'short' }, { label: false })
}

function formatScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) return '—'
  return `${Math.round(score)}%`
}

export function AttemptsTable({ rows, totalCount, pageSize }: Readonly<Props>) {
  const searchParams = useSearchParams()
  const page = parsePageParam(searchParams?.get('attemptsPage') ?? undefined)
  const filtered = FILTER_KEYS.some((k) => searchParams?.get(k))
  const emptyText = filtered ? 'No attempts match these filters.' : 'No attempts yet'

  return (
    <div className="space-y-stack">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-col-md">Student</TableHead>
            <TableHead className="min-w-col-sm">Subject</TableHead>
            <TableHead className="w-col-md">Sitting (UTC)</TableHead>
            <TableHead className="w-col-md">Started (UTC)</TableHead>
            <TableHead className="w-col-md">Ended (UTC)</TableHead>
            <TableHead className="w-col-xs">Score</TableHead>
            <TableHead className="w-col-code">Result</TableHead>
            <TableHead className="w-col-code">Answered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="p-section">
                <EmptyDescription className="text-center">{emptyText}</EmptyDescription>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => <AttemptRow key={r.sessionId} row={r} />)
          )}
        </TableBody>
      </Table>

      <PaginationBar
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        entityLabel="attempts"
        paramKey="attemptsPage"
      />
    </div>
  )
}

function SittingCell({
  sittingId,
  sittingAt,
}: Readonly<{ sittingId?: string | null; sittingAt: string | null }>) {
  return (
    <TableCell className="text-caption">
      {sittingId ? (
        <Link
          href={`${SITTING_BASE}/${sittingId}`}
          prefetch={false}
          onClick={(e) => e.stopPropagation()}
          className="text-foreground focus-visible:underline"
        >
          {formatAbsolute(sittingAt)}
        </Link>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  )
}

function StudentCell({ href, label }: Readonly<{ href: string; label: string }>) {
  return (
    <TableCell>
      <Link
        href={href}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        className="font-medium text-foreground no-underline focus-visible:underline"
      >
        {label}
      </Link>
    </TableCell>
  )
}

function ResultCell({ passed }: Readonly<{ passed: boolean | null }>) {
  return (
    <TableCell>
      {passed === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <PassFailStatus passed={passed} />
      )}
    </TableCell>
  )
}

function useRowNavigation(href: string) {
  const router = useRouter()
  const navigate = () => router.push(href)
  const onClick = navigate
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    // Keys on a focused link inside the row follow that link.
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      navigate()
    }
  }
  return { onClick, onKeyDown }
}

function AttemptRow({ row: r }: Readonly<{ row: InternalExamAttemptRow }>) {
  const href = `/app/admin/internal-exams/report?session=${r.sessionId}`
  const studentLabel = r.studentName || r.studentEmail || '—'
  const nav = useRowNavigation(href)

  return (
    <TableRow
      tabIndex={0}
      {...nav}
      className="cursor-pointer hover:bg-accent focus-visible:outline focus-visible:outline-focus focus-visible:-outline-offset-focus focus-visible:outline-ring"
    >
      <StudentCell href={href} label={studentLabel} />
      <TableCell>{r.subjectName || '—'}</TableCell>
      <SittingCell sittingId={r.sittingId} sittingAt={r.sittingAt ?? null} />
      <TableCell className="text-caption text-muted-foreground">
        {formatAbsolute(r.startedAt)}
      </TableCell>
      <TableCell className="text-caption text-muted-foreground">
        {formatAbsolute(r.endedAt)}
      </TableCell>
      <TableCell className="text-label-strong tabular-nums">
        {formatScore(r.scorePercentage)}
      </TableCell>
      <ResultCell passed={r.passed} />
      <TableCell className="text-caption tabular-nums">
        {formatCorrectFraction(r.correctCount ?? 0, r.answeredItems)}
      </TableCell>
    </TableRow>
  )
}
