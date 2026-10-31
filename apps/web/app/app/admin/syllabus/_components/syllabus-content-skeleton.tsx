import { Skeleton } from '@/components/ui/skeleton'

export function SyllabusContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-skeleton-row w-full" />
      <Skeleton className="h-skeleton-row w-full" />
      <Skeleton className="h-skeleton-row w-full" />
      <Skeleton className="h-skeleton-row w-full" />
      <Skeleton className="h-skeleton-row w-full" />
    </div>
  )
}
