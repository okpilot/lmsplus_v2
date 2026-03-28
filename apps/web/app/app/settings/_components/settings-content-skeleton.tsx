import { Skeleton } from '@/components/ui/skeleton'

export function SettingsContentSkeleton() {
  return (
    <>
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </>
  )
}
