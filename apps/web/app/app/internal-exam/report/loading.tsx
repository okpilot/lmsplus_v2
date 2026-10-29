import { Skeleton } from '@/components/ui/skeleton'

export default function InternalExamReportLoading() {
  return (
    <main className="space-y-section">
      <div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
    </main>
  )
}
