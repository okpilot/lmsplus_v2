import { rethrowRedirect } from '@/lib/next/rethrow-redirect'
import { ContentErrorFallback } from '../../../_components/content-error-fallback'
import type { StudentSessionFilters } from '../../../types'
import type { StudentSessionsResult } from '../queries'
import { SessionHistoryTable } from './session-history-table'

type Props = Readonly<{
  sessionsPromise: Promise<StudentSessionsResult>
  filters: StudentSessionFilters
}>

export async function SessionHistoryContent({ sessionsPromise, filters }: Readonly<Props>) {
  try {
    const { sessions, totalCount } = await sessionsPromise
    return <SessionHistoryTable sessions={sessions} totalCount={totalCount} filters={filters} />
  } catch (error) {
    rethrowRedirect(error)
    return (
      <ContentErrorFallback message="Failed to load session history. Please refresh the page." />
    )
  }
}
