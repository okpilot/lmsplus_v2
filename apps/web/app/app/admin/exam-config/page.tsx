import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { ExamConfigContent } from './_components/exam-config-content'
import { ExamConfigRowsSkeleton } from './loading'

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
  return <ExamConfigRowsSkeleton />
}
