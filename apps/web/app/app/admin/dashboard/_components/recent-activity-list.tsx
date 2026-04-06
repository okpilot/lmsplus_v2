import { Badge } from '@/components/ui/badge'
import type { RecentSession } from '../types'

type Props = Readonly<{ sessions: RecentSession[] }>

function formatRelativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getScoreColor(score: number): string {
  if (score < 50) return 'text-red-600'
  if (score < 80) return 'text-amber-600'
  return 'text-green-600'
}

export function RecentActivityList({ sessions }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <h2 className="text-lg font-semibold">Recent Activity</h2>

      {sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.sessionId} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{session.studentName ?? 'Unknown student'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {session.subjectName ?? 'Unknown subject'}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Badge variant="outline" className="capitalize text-xs">
                  {session.mode}
                </Badge>
                {session.scorePercentage !== null ? (
                  <span
                    className={`tabular-nums font-semibold ${getScoreColor(session.scorePercentage)}`}
                  >
                    {Math.round(session.scorePercentage)}%
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(session.endedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
