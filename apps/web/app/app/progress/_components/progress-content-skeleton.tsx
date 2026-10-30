import { Skeleton } from '@/components/ui/skeleton'

export function ProgressContentSkeleton() {
  return (
    <>
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
      </div>
    </>
  )
}
