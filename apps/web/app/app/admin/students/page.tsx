import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/auth/require-admin'
import { StudentsContent } from './_components/students-content'
import { parseFilters } from './parse-filters'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const filters = parseFilters(await searchParams)

  return (
    <div className="space-y-section">
      <PageHeader
        title="Student Management"
        description="Register and manage students on the platform."
      />
      <Suspense fallback={<Skeleton className="h-skeleton-chart-lg" />}>
        <StudentsContent filters={filters} />
      </Suspense>
    </div>
  )
}
