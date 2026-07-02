import { rethrowRedirect } from '@/lib/next/rethrow-redirect'
import { getDashboardStudents } from '../queries'
import type { DashboardFilters } from '../types'
import { ContentErrorFallback } from './content-error-fallback'
import { StudentTableShell } from './student-table-shell'

type Props = Readonly<{ filters: DashboardFilters }>

export async function StudentTableContent({ filters }: Props) {
  try {
    const { students, totalCount } = await getDashboardStudents(filters)
    return <StudentTableShell students={students} totalCount={totalCount} filters={filters} />
  } catch (error) {
    rethrowRedirect(error)
    return <ContentErrorFallback message="Failed to load students. Please refresh the page." />
  }
}
