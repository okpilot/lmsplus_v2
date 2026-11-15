import { redirect } from 'next/navigation'
import { getCourses, getGroupOptions, getStudentsPage, PAGE_SIZE } from '../queries'
import type { StudentFilters } from '../types'
import { StudentsPageShell } from './students-page-shell'

type Props = { filters: StudentFilters & { page: number } }

// KEEP IN SYNC WITH StudentFilters — add, rename, or remove fields here to preserve them on redirect
function lastPageUrl(filters: StudentFilters, totalPages: number): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.role) params.set('role', filters.role)
  if (filters.group) params.set('group', filters.group)
  if (filters.search) params.set('search', filters.search)
  if (totalPages > 1) params.set('page', String(totalPages))
  return `/app/admin/students?${params.toString()}`
}

export async function StudentsContent({ filters }: Readonly<Props>) {
  const [{ rows, totalCount }, courses, groups] = await Promise.all([
    getStudentsPage(filters),
    getCourses(),
    getGroupOptions(),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  if (filters.page > totalPages) redirect(lastPageUrl(filters, totalPages))

  return (
    <StudentsPageShell
      students={rows}
      courses={courses}
      groups={groups}
      filters={filters}
      page={filters.page}
      totalCount={totalCount}
      pageSize={PAGE_SIZE}
    />
  )
}
