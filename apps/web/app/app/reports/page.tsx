import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ReportsContent } from './_components/reports-content'

export const dynamic = 'force-dynamic'

function ReportsContentFallback() {
  return (
    <>
      <Skeleton className="h-5 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </>
  )
}

export default function ReportsPage() {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <Suspense fallback={<ReportsContentFallback />}>
        <ReportsContent />
      </Suspense>
    </main>
  )
}
