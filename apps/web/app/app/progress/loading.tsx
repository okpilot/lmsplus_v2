import { Skeleton } from '@/components/ui/skeleton'

export default function ProgressLoading() {
  return (
    <main className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </main>
  )
}
