import { CardList } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ExamConfigRowsSkeleton() {
  return (
    <CardList>
      {Array.from({ length: 9 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <div key={i} className="p-4">
          <Skeleton className="h-5 w-full" />
        </div>
      ))}
    </CardList>
  )
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
      <ExamConfigRowsSkeleton />
    </div>
  )
}
