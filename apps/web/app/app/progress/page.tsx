import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { ProgressContent } from './_components/progress-content'
import { ProgressContentSkeleton } from './_components/progress-content-skeleton'

export const dynamic = 'force-dynamic'

export default function ProgressPage() {
  return (
    <main className="space-y-section">
      <PageHeader
        title="Progress"
        description="Detailed breakdown of your mastery across all EASA subjects."
      />

      <Suspense fallback={<ProgressContentSkeleton />}>
        <ProgressContent />
      </Suspense>
    </main>
  )
}
