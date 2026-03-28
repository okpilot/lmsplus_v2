import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardHeader } from './_components/dashboard-header'
import { DashboardStatsContent } from './_components/dashboard-stats-content'
import { HeatmapContent } from './_components/heatmap-content'

export const dynamic = 'force-dynamic'

function HeatmapSkeleton() {
  return <Skeleton className="h-[220px] w-full rounded-xl" />
}

function StatsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div>
        <Skeleton className="mb-3 h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <main className="space-y-8">
      <DashboardHeader />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <Suspense fallback={<HeatmapSkeleton />}>
            <HeatmapContent />
          </Suspense>
        </div>
        <div className="order-1 md:order-2">
          <Suspense fallback={<StatsSkeleton />}>
            <DashboardStatsContent />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
