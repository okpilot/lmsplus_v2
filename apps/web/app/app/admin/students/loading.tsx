import { Skeleton } from '@/components/ui/skeleton'

export default function StudentsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
    </div>
  )
}
