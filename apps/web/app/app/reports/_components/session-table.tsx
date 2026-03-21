'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { SessionReport } from '@/lib/queries/reports'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, MODE_LABELS } from './reports-utils'

export function SessionTable({ sessions }: { sessions: SessionReport[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="px-4 py-3 text-left font-medium">Date</th>
          <th className="px-4 py-3 text-left font-medium">Subject</th>
          <th className="px-4 py-3 text-left font-medium">Mode</th>
          <th className="px-4 py-3 text-left font-medium">Correct</th>
          <th className="px-4 py-3 text-left font-medium">Time</th>
          <th className="px-4 py-3 text-right font-medium">Score</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </tbody>
    </table>
  )
}

function SessionRow({ session: s }: { session: SessionReport }) {
  const router = useRouter()
  const exam = s.mode === 'mock_exam'
  const score = s.scorePercentage != null ? `${Math.round(s.scorePercentage)}%` : '\u2014'
  const color = s.scorePercentage != null ? scoreColor(s.scorePercentage) : undefined
  const href = `/app/quiz/report?session=${s.id}`

  return (
    <tr
      className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent"
      onClick={() => router.push(href)}
    >
      <td className="px-4 py-3 text-muted-foreground">{formatDate(s.startedAt)}</td>
      <td className="px-4 py-3 font-medium">
        <Link href={href} onClick={(e) => e.stopPropagation()}>
          {s.subjectName ?? '\u2014'}
        </Link>
      </td>
      <td className="px-4 py-3">
        {exam ? (
          <ExamBadge />
        ) : (
          <span className="text-muted-foreground">{MODE_LABELS[s.mode] ?? s.mode}</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {s.correctCount} / {s.totalQuestions}
      </td>
      <td className="px-4 py-3 text-muted-foreground">{s.durationMinutes}m</td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color }}>
        {score}
      </td>
    </tr>
  )
}

function ExamBadge() {
  return (
    <span className="inline-block rounded-sm border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-amber-600">
      Exam
    </span>
  )
}
