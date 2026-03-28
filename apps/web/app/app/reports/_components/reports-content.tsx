import { getAllSessions } from '@/lib/queries/reports'
import { ReportsList } from './reports-list'

export async function ReportsContent() {
  const sessions = await getAllSessions()

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {sessions.length} completed {sessions.length === 1 ? 'session' : 'sessions'}
      </p>
      <ReportsList sessions={sessions} />
    </>
  )
}
