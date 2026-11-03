import { Skeleton } from '@/components/ui/skeleton'

export function HeatmapSkeleton() {
  return <Skeleton className="h-skeleton-card w-full rounded-card" />
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <Skeleton className="h-skeleton-card rounded-card" />
      <Skeleton className="h-skeleton-card rounded-card" />
      <Skeleton className="h-skeleton-card rounded-card" />
    </div>
  )
}

export function SubjectGridSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-skeleton-title w-skeleton-w" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-skeleton-card rounded-card" />
        <Skeleton className="h-skeleton-card rounded-card" />
        <Skeleton className="h-skeleton-card rounded-card" />
      </div>
    </div>
  )
}
