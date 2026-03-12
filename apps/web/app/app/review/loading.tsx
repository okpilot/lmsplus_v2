import { Skeleton } from '@/components/ui/skeleton'

export default function ReviewLoading() {
  return (
    <main className="space-y-6">
      <div>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
    </main>
  )
}
