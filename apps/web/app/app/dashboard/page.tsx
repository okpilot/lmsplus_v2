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
      <Suspense fallback={<StatCardsSkeleton />}>
        <DashboardStatsContent />
      </Suspense>
      <Suspense fallback={<HeatmapSkeleton />}>
        <HeatmapContent />
      </Suspense>
      <Suspense fallback={<SubjectGridSkeleton />}>
        <SubjectGridContent />
      </Suspense>
    </main>
  )
}
