import { Suspense } from 'react'
import { ReportsContent } from './_components/reports-content'
import { ReportsContentFallback } from './_components/reports-content-fallback'

export const dynamic = 'force-dynamic'

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
