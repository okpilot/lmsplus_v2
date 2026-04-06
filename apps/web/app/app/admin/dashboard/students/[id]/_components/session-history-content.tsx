import type { StudentSessionFilters } from '../../../types'
import { getStudentSessions } from '../queries'
import { SessionHistoryTable } from './session-history-table'

type Props = Readonly<{ studentId: string; filters: StudentSessionFilters }>

export async function SessionHistoryContent({ studentId, filters }: Props) {
  const { sessions, totalCount } = await getStudentSessions(studentId, filters)

  return <SessionHistoryTable sessions={sessions} totalCount={totalCount} filters={filters} />
}
