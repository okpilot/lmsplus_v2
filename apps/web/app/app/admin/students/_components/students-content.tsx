import { getStudentsList } from '../queries'
import type { StudentFilters } from '../types'
import { StudentsPageShell } from './students-page-shell'

type Props = { filters: StudentFilters }

export async function StudentsContent({ filters }: Readonly<Props>) {
  const students = await getStudentsList(filters)
  return <StudentsPageShell students={students} filters={filters} />
}
