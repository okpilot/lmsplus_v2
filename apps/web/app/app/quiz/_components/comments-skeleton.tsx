import { Skeleton } from '@/components/ui/skeleton'

export function CommentsSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="flex gap-3">
        <Skeleton className="size-8 rounded-pill" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-skeleton-line w-skeleton-w" />
          <Skeleton className="h-skeleton-line w-full" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="size-8 rounded-pill" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-skeleton-line w-skeleton-w" />
          <Skeleton className="h-skeleton-line w-3/4" />
        </div>
      </div>
    </div>
  )
}
