import { getRecentSessions } from '../queries'
import type { TimeRange } from '../types'
import { ContentErrorFallback } from './content-error-fallback'
import { RecentActivityList } from './recent-activity-list'

type Props = Readonly<{ range: TimeRange }>

export async function RecentActivityContent({ range }: Props) {
  try {
    const sessions = await getRecentSessions(range)
    return <RecentActivityList sessions={sessions} />
  } catch {
    return (
      <ContentErrorFallback message="Failed to load recent activity. Please refresh the page." />
    )
  }
}
