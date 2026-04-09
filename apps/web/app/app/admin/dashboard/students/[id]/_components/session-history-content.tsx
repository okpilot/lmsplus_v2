import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { ContentErrorFallback } from '../../../_components/content-error-fallback'
import type { StudentSessionFilters } from '../../../types'
import { getStudentSessions } from '../queries'
import { SessionHistoryTable } from './session-history-table'

type Props = Readonly<{ studentId: string; filters: StudentSessionFilters }>

export async function SessionHistoryContent({ studentId, filters }: Props) {
  try {
    const { sessions, totalCount } = await getStudentSessions(studentId, filters)
    return <SessionHistoryTable sessions={sessions} totalCount={totalCount} filters={filters} />
  } catch (error) {
    if (isRedirectError(error)) throw error
    return (
      <ContentErrorFallback message="Failed to load session history. Please refresh the page." />
    )
  }
}
