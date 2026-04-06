import { getDashboardStudents } from '../queries'
import type { DashboardFilters } from '../types'
import { StudentTableShell } from './student-table-shell'

type Props = Readonly<{ filters: DashboardFilters }>

export async function StudentTableContent({ filters }: Props) {
  try {
    const { students, totalCount } = await getDashboardStudents(filters)
    return <StudentTableShell students={students} totalCount={totalCount} filters={filters} />
  } catch {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Failed to load students. Please refresh the page.
      </div>
    )
  }
}
