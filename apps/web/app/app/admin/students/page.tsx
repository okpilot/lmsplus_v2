import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/auth/require-admin'
import { StudentsContent } from './_components/students-content'
import { StudentsTabs } from './_components/students-tabs'
import { parseTabParam } from './_utils/tab-url'
import { GroupsPanel } from './groups/_components/groups-panel'
import { parseFilters } from './parse-filters'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function StudentsPage({ searchParams }: Readonly<PageProps>) {
  await requireAdmin()
  const params = await searchParams
  const filters = parseFilters(params)

  return (
    <div className="space-y-section">
      <PageHeader
        title="Student Management"
        description="Register and manage students and groups."
      />
      <StudentsTabs
        students={
          <Suspense fallback={<Skeleton className="h-skeleton-chart-lg" />}>
            <StudentsContent filters={filters} tab={parseTabParam(params.tab)} />
          </Suspense>
        }
        groups={
          <Suspense fallback={<Skeleton className="h-skeleton-chart-lg" />}>
            <GroupsPanel />
          </Suspense>
        }
      />
    </div>
  )
}
