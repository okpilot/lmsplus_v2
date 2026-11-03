import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="space-y-section">
      <div className="space-y-2">
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="h-skeleton-line w-skeleton-w-lg" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['kpi-1', 'kpi-2', 'kpi-3', 'kpi-4', 'kpi-5'].map((id) => (
          <Skeleton key={id} className="h-skeleton-card rounded-card" />
        ))}
      </div>
      <Skeleton className="h-skeleton-chart-lg rounded-card" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-skeleton-chart rounded-card" />
        <Skeleton className="h-skeleton-chart rounded-card" />
      </div>
    </div>
  )
}
