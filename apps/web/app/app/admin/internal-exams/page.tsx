import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { InternalExamsContent } from './_components/internal-exams-content'
import { InternalExamsFallback } from './_components/internal-exams-fallback'

export default async function InternalExamsPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Internal Exams</h1>
        <p className="text-sm text-muted-foreground">
          Issue one-time exam codes to students and review past attempts.
        </p>
      </div>
      <Suspense fallback={<InternalExamsFallback />}>
        <InternalExamsContent />
      </Suspense>
    </div>
  )
}
