import { Skeleton } from '@/components/ui/skeleton'
import { ExamConfigRowsSkeleton } from './_components/exam-config-rows-skeleton'

export default function Loading() {
  return (
    <div className="space-y-section">
      <div>
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="mt-1 h-skeleton-line w-skeleton-w-lg" />
      </div>
      <ExamConfigRowsSkeleton />
    </div>
  )
}
