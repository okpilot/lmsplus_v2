import { Skeleton } from '@/components/ui/skeleton'

export function ProgressContentSkeleton() {
  return (
    <>
      <Skeleton className="h-skeleton-card w-full rounded-card" />
      <div className="space-y-stack">
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
        <Skeleton className="h-skeleton-row-lg rounded-card" />
      </div>
    </>
  )
}
