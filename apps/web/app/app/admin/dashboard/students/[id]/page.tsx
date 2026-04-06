import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SessionHistoryContent } from './_components/session-history-content'
import { StudentHeader } from './_components/student-header'
import { parseSessionFilters } from './parse-filters'
import { getStudentDetail } from './queries'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function StudentDetailPage({ params, searchParams }: Readonly<PageProps>) {
  const [{ id }, rawParams] = await Promise.all([params, searchParams])
  const filters = parseSessionFilters(rawParams)

  const student = await getStudentDetail(id)
  if (!student) notFound()

  return (
    <div className="space-y-6">
      <StudentHeader student={student} />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <SessionHistoryContent studentId={id} filters={filters} />
      </Suspense>
    </div>
  )
}
