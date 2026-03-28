import { Skeleton } from '@/components/ui/skeleton'

export function HeatmapSkeleton() {
  return <Skeleton className="h-[220px] w-full rounded-xl" />
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  )
}

export function SubjectGridSkeleton() {
  return (
    <div>
      <Skeleton className="mb-3 h-6 w-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  )
}
