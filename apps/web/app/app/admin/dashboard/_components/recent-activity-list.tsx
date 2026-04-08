import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { getMasteryColor } from '../_lib/constants'
import type { RecentSession } from '../types'
import { formatRelativeTime } from './student-table-helpers'

type Props = Readonly<{ sessions: RecentSession[] }>

export function RecentActivityList({ sessions }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <h2 className="text-lg font-semibold">Recent Activity</h2>

      {sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.sessionId}
              href={`/app/admin/dashboard/sessions/${session.sessionId}`}
              className="flex w-full items-center justify-between gap-3 text-sm text-left rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            >
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
                    className={`tabular-nums font-semibold ${getMasteryColor(session.scorePercentage)}`}
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
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
