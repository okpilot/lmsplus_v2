import { Skeleton } from '@/components/ui/skeleton'

export default function ProgressLoading() {
  return (
    <main className="space-y-6">
      <div>
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-1 h-4 w-80" />
      </div>
    </main>
  )
}
