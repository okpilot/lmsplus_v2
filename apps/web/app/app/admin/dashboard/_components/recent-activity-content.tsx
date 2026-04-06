import { getRecentSessions } from '../queries'
import type { TimeRange } from '../types'
import { RecentActivityList } from './recent-activity-list'

type Props = Readonly<{ range: TimeRange }>

export async function RecentActivityContent({ range }: Props) {
  try {
    const sessions = await getRecentSessions(range)
    return <RecentActivityList sessions={sessions} />
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Failed to load recent activity. Please refresh the page.
      </div>
    )
  }
}
