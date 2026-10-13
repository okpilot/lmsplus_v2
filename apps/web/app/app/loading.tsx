import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-32 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  )
}
