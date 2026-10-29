import { Skeleton } from '@/components/ui/skeleton'

export function SettingsContentSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  )
}
