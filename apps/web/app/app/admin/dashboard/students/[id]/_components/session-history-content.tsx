import type { StudentSessionFilters } from '../../../types'
import { getStudentSessions } from '../queries'
import { SessionHistoryTable } from './session-history-table'

type Props = Readonly<{ studentId: string; filters: StudentSessionFilters }>

export async function SessionHistoryContent({ studentId, filters }: Props) {
  try {
    const { sessions, totalCount } = await getStudentSessions(studentId, filters)
    return <SessionHistoryTable sessions={sessions} totalCount={totalCount} filters={filters} />
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Failed to load session history. Please refresh the page.
      </div>
    )
  }
}
