import { Suspense } from 'react'
import { ProgressContent } from './_components/progress-content'
import { ProgressContentSkeleton } from './_components/progress-content-skeleton'

export const dynamic = 'force-dynamic'

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
