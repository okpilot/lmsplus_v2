import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { InternalExamsContent } from './_components/internal-exams-content'

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

function InternalExamsFallback() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
