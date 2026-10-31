import { Skeleton } from '@/components/ui/skeleton'

export default function QuestionsLoading() {
  return (
    <div className="space-y-section">
      <div className="space-y-2">
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="h-skeleton-line w-skeleton-w-lg" />
      </div>
    </div>
  )
}
