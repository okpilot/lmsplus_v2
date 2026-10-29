import { Skeleton } from '@/components/ui/skeleton'

export function SettingsContentSkeleton() {
  return (
    <div className="space-y-section">
      <Skeleton className="h-48 w-full rounded-card" />
      <div className="grid gap-cards lg:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    </div>
  )
}
