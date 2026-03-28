import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { ProgressContent } from './_components/progress-content'

export const dynamic = 'force-dynamic'

function ProgressContentSkeleton() {
  return (
    <>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
        <Skeleton className="h-16 rounded-md" />
      </div>
    </>
  )
}

export default function ProgressPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Detailed breakdown of your mastery across all EASA subjects.
        </p>
      </div>

      <Suspense fallback={<ProgressContentSkeleton />}>
        <ProgressContent />
      </Suspense>
    </main>
  )
}
