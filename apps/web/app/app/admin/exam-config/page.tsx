import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAdmin } from '@/lib/auth/require-admin'
import { ExamConfigContent } from './_components/exam-config-content'

export default async function ExamConfigPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Exam Configuration"
        description="Configure practice exam parameters for each EASA PPL subject."
      />
      <Suspense fallback={<ExamConfigFallback />}>
        <ExamConfigContent />
      </Suspense>
    </div>
  )
}

function ExamConfigFallback() {
  return (
    <div className="grid gap-4">
      {Array.from({ length: 9 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  )
}
