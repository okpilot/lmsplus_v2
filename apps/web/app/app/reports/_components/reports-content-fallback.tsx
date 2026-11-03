import { Skeleton } from '@/components/ui/skeleton'

export function ReportsContentFallback() {
  return (
    <>
      <Skeleton className="h-skeleton-title w-skeleton-w" />
      <div className="space-y-2">
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
      </div>
    </>
  )
}
