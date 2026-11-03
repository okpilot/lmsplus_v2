import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  return (
    <div
      aria-busy="true"
      className="flex flex-col gap-section opacity-0 [animation:look-appear_var(--transition-duration-base)_var(--ease-enter)_400ms_forwards]"
    >
      <span className="sr-only">Loading</span>
      <Skeleton className="h-skeleton-title w-skeleton-w" />
      <Skeleton className="h-skeleton-card w-full rounded-card" />
      <Skeleton className="h-skeleton-card w-full rounded-card" />
      <Skeleton className="h-skeleton-card w-full rounded-card" />
    </div>
  )
}
