import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { InternalExamContent } from './_components/internal-exam-content'

export const dynamic = 'force-dynamic'

export default async function InternalExamPage() {
  await requireAuthUser()

  return (
    <main className="space-y-section">
      <PageHeader
        title="Internal Exam"
        description="Enter the code from your administrator to begin a supervised internal exam."
      />
      <Suspense fallback={<InternalExamFallback />}>
        <InternalExamContent />
      </Suspense>
    </main>
  )
}

function InternalExamFallback() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <Skeleton key={i} className="h-20 rounded-card" />
      ))}
    </div>
  )
}
