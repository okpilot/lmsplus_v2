import { getCourses, getStudentsList } from '../queries'
import type { StudentFilters } from '../types'
import { StudentsPageShell } from './students-page-shell'

type Props = { filters: StudentFilters }

export async function StudentsContent({ filters }: Readonly<Props>) {
  const [students, courses] = await Promise.all([getStudentsList(filters), getCourses()])
  return <StudentsPageShell students={students} courses={courses} filters={filters} />
}
