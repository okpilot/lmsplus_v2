import { Skeleton } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <main className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-5 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </main>
  )
}
