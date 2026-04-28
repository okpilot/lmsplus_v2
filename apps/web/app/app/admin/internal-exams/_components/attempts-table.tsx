'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InternalExamAttemptRow } from '../types'

type Props = { rows: InternalExamAttemptRow[] }

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
}

function formatScore(score: number | null): string {
  if (score === null || Number.isNaN(score)) return '—'
  return `${Math.round(score)}%`
}

export function AttemptsTable({ rows }: Readonly<Props>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[160px]">Student</TableHead>
            <TableHead className="min-w-[140px]">Subject</TableHead>
            <TableHead className="w-40">Started</TableHead>
            <TableHead className="w-40">Ended</TableHead>
            <TableHead className="w-20">Score</TableHead>
            <TableHead className="w-24">Result</TableHead>
            <TableHead className="w-24">Answered</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                No attempts yet
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const total = r.totalQuestions ?? 0
              const correct = r.correctCount ?? 0
              const passed = r.passed
              return (
                <TableRow key={r.sessionId}>
                  <TableCell>
                    <Link
                      href={`/app/quiz/report?id=${r.sessionId}`}
                      className="text-primary hover:underline"
                    >
                      {r.studentName || r.studentEmail || '—'}
                    </Link>
                  </TableCell>
                  <TableCell>{r.subjectName || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatAbsolute(r.startedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatAbsolute(r.endedAt)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatScore(r.scorePercentage)}
                  </TableCell>
                  <TableCell>
                    {passed === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : passed ? (
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
                    {correct}/{total}
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
