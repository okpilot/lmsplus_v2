import { Skeleton } from '@/components/ui/skeleton'

export function QuestionsContentFallback() {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-control w-skeleton-w" />
        <Skeleton className="h-control w-skeleton-w" />
        <Skeleton className="h-control w-skeleton-w" />
        <Skeleton className="h-control w-skeleton-w" />
        <Skeleton className="h-control w-skeleton-w" />
        <Skeleton className="h-control w-skeleton-w" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-skeleton-row w-full" />
        <Skeleton className="h-skeleton-row w-full" />
        <Skeleton className="h-skeleton-row w-full" />
        <Skeleton className="h-skeleton-row w-full" />
        <Skeleton className="h-skeleton-row w-full" />
        <Skeleton className="h-skeleton-row w-full" />
      </div>
    </>
  )
}
