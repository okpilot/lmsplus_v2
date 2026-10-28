import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { scoreColor } from '@/lib/utils/score-color'
import type { RecentSession } from '../types'
import { formatRelativeTime } from './student-table-helpers'

type Props = Readonly<{ sessions: RecentSession[] }>

export function RecentActivityList({ sessions }: Readonly<Props>) {
  return (
    <Card className="overflow-hidden">
      <CardContent>
        <Heading level={2}>Recent Activity</Heading>
      </CardContent>
      {sessions.length === 0 ? (
        <CardContent>
          <EmptyNote variant="inline" className="py-6 text-center">
            No sessions yet.
          </EmptyNote>
        </CardContent>
      ) : (
        <div className="divide-y divide-border">
          {sessions.map((session) => (
            <ActivityRow key={session.sessionId} session={session} />
          ))}
        </div>
      )}
    </Card>
  )
}

function ActivityRow({ session }: Readonly<{ session: RecentSession }>) {
  return (
    <Link
      href={`/app/admin/dashboard/sessions/${session.sessionId}`}
      className="flex w-full items-center justify-between gap-3 text-sm text-left px-card py-3 transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2"
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
        <ActivityScore score={session.scorePercentage} />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(session.endedAt)}
        </span>
      </div>
    </Link>
  )
}

function ActivityScore({ score }: Readonly<{ score: number | null }>) {
  if (score === null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tabular-nums font-semibold" style={{ color: scoreColor(score) }}>
      {Math.round(score)}%
    </span>
  )
}
