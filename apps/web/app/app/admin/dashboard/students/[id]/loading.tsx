import { Skeleton } from '@/components/ui/skeleton'

export default function StudentDetailLoading() {
  return (
    <div className="space-y-section">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-96 rounded-card" />
    </div>
  )
}
