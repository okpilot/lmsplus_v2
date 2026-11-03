import { Skeleton } from '@/components/ui/skeleton'

export default function StudentDetailLoading() {
  return (
    <div className="space-y-section">
      <Skeleton className="h-skeleton-title w-skeleton-w" />
      <div className="space-y-2">
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="h-skeleton-title w-skeleton-w" />
      </div>
      <Skeleton className="h-skeleton-chart-lg rounded-card" />
    </div>
  )
}
