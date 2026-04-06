import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardHeader } from './_components/dashboard-header'
import { KpiCardsContent } from './_components/kpi-cards-content'
import { RecentActivityContent } from './_components/recent-activity-content'
import { StudentTableContent } from './_components/student-table-content'
import { WeakTopicsContent } from './_components/weak-topics-content'
import { parseFilters } from './parse-filters'

const KPI_KEYS = ['active', 'mastery', 'sessions', 'weakest', 'exam'] as const

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {KPI_KEYS.map((k) => (
        <Skeleton key={k} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export default async function AdminDashboardPage({ searchParams }: Readonly<PageProps>) {
  const filters = parseFilters(await searchParams)

  return (
    <div className="space-y-6">
      <DashboardHeader currentRange={filters.range} />
      <Suspense fallback={<KpiSkeleton />}>
        <KpiCardsContent range={filters.range} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <StudentTableContent filters={filters} />
      </Suspense>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <WeakTopicsContent />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
          <RecentActivityContent range={filters.range} />
        </Suspense>
      </div>
    </div>
  )
}
