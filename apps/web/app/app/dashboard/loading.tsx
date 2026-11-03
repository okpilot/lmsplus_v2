import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <main className="space-y-section">
      <div>
        <Skeleton className="h-skeleton-title w-skeleton-w" />
        <Skeleton className="mt-1 h-skeleton-line w-skeleton-w" />
      </div>
    </main>
  )
}
