import { Skeleton } from '@/components/ui/skeleton'

export function ReportsContentFallback() {
  return (
    <>
      <Skeleton className="h-5 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </>
  )
}
