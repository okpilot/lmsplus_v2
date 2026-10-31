import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="space-y-section">
      <Skeleton className="h-skeleton-title w-skeleton-w" />
      <Skeleton className="h-skeleton-card-lg w-full rounded-card" />
      <div className="grid gap-cards lg:grid-cols-2">
        <Skeleton className="h-skeleton-card-lg w-full rounded-card" />
        <Skeleton className="h-skeleton-card-lg w-full rounded-card" />
      </div>
    </div>
  )
}
