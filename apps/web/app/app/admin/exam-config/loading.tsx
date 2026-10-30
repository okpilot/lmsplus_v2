import { Skeleton } from '@/components/ui/skeleton'
import { ExamConfigRowsSkeleton } from './_components/exam-config-rows-skeleton'

export default function Loading() {
  return (
    <div className="space-y-section">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
      <ExamConfigRowsSkeleton />
    </div>
  )
}
