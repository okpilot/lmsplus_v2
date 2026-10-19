import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/auth/require-admin'
import { SessionHistoryContent } from './_components/session-history-content'
import { StudentHeader } from './_components/student-header'
import { parseSessionFilters } from './parse-filters'
import { getStudentDetail } from './queries'
import { startStudentSessions } from './start-student-sessions'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function StudentDetailPage({ params, searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const [{ id }, rawParams] = await Promise.all([params, searchParams])
  if (!UUID_RE.test(id)) notFound()

  const filters = parseSessionFilters(rawParams)
  const sessionsPromise = startStudentSessions(id, filters)

  const student = await getStudentDetail(id)
  if (!student) notFound()

  return (
    <div className="space-y-6">
      <StudentHeader student={student} />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <SessionHistoryContent sessionsPromise={sessionsPromise} filters={filters} />
      </Suspense>
    </div>
  )
}
