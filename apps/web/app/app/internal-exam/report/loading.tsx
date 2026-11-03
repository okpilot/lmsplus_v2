import { Skeleton } from '@/components/ui/skeleton'

export default function InternalExamReportLoading() {
  return (
    <main className="space-y-section">
      <div>
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="mt-2 h-skeleton-line w-skeleton-w" />
      </div>
    </main>
  )
}
