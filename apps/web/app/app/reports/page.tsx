import { getAllSessions } from '@/lib/queries/reports'
import { ReportsList } from './_components/reports-list'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const sessions = await getAllSessions()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sessions.length} completed {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>

      <ReportsList sessions={sessions} />
    </main>
  )
}
