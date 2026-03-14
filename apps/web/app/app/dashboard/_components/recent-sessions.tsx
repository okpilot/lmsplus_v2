import type { RecentSession } from '@/lib/queries/dashboard'

type RecentSessionsProps = {
  sessions: RecentSession[]
}

const MODE_LABELS: Record<string, string> = {
  quick_quiz: 'Quiz',
  mock_exam: 'Mock Exam',
}

export function RecentSessions({ sessions }: RecentSessionsProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No sessions yet. Start a quiz to see your history here.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => (
        <SessionRow key={session.id} session={session} />
      ))}
    </div>
  )
}

function SessionRow({ session }: { session: RecentSession }) {
  const score = session.scorePercentage != null ? `${Math.round(session.scorePercentage)}%` : '—'
  const date = new Date(session.startedAt)
  const timeAgo = formatTimeAgo(date)

  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {MODE_LABELS[session.mode] ?? session.mode}
          {session.subjectName ? ` — ${session.subjectName}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          {session.correctCount}/{session.totalQuestions} correct · {timeAgo}
        </p>
      </div>
      <span className="ml-3 text-sm font-semibold tabular-nums">{score}</span>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}
