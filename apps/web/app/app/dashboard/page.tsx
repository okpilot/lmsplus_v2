import { Suspense } from 'react'
import { DashboardHeader } from './_components/dashboard-header'
import {
  HeatmapSkeleton,
  StatCardsSkeleton,
  SubjectGridSkeleton,
} from './_components/dashboard-skeletons'
import { DashboardStatsContent } from './_components/dashboard-stats-content'
import { HeatmapContent } from './_components/heatmap-content'
import { SubjectGridContent } from './_components/subject-grid-content'

export const dynamic = 'force-dynamic'

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
          <Suspense fallback={<StatCardsSkeleton />}>
            <DashboardStatsContent />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<SubjectGridSkeleton />}>
        <SubjectGridContent />
      </Suspense>
    </main>
  )
}
