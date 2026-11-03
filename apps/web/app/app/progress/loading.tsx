import { Skeleton } from '@/components/ui/skeleton'

export default function ProgressLoading() {
  return (
    <main className="space-y-section">
      <div>
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="mt-1 h-skeleton-line w-skeleton-w-lg" />
      </div>
    </main>
  )
}
