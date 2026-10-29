import { Skeleton } from '@/components/ui/skeleton'

export function CommentsSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="flex gap-3">
        <Skeleton className="size-8 rounded-pill" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
      <div className="flex gap-3">
        <Skeleton className="size-8 rounded-pill" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
    </div>
  )
}
