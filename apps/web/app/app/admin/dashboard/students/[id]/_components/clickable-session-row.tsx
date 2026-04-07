'use client'

import { useRouter } from 'next/navigation'
import { TableCell, TableRow } from '@/components/ui/table'
import type { StudentSession } from '../../../types'
import { formatDate, formatDuration } from './session-table-helpers'

export function ClickableSessionRow({ session: s }: Readonly<{ session: StudentSession }>) {
  const router = useRouter()
  const navigate = () => router.push(`/app/admin/dashboard/sessions/${s.sessionId}`)

  return (
    <TableRow
      tabIndex={0}
      className="cursor-pointer hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      onClick={navigate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate()
        }
      }}
    >
      <TableCell>{formatDate(s.endedAt)}</TableCell>
      <TableCell>{s.subjectName ?? '\u2014'}</TableCell>
      <TableCell>{s.topicName ?? '\u2014'}</TableCell>
      <TableCell className="capitalize">{s.mode}</TableCell>
      <TableCell>{s.scorePercentage !== null ? `${s.scorePercentage}%` : '\u2014'}</TableCell>
      <TableCell>
        {s.correctCount}/{s.totalQuestions}
      </TableCell>
      <TableCell>{formatDuration(s.startedAt, s.endedAt)}</TableCell>
    </TableRow>
  )
}
