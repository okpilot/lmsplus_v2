import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { requireAdmin } from '@/lib/auth/require-admin'
import { SyllabusContent } from './_components/syllabus-content'
import { SyllabusContentSkeleton } from './_components/syllabus-content-skeleton'

export default async function SyllabusPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Syllabus Manager"
        description="Manage the EASA PPL subject hierarchy. Add subjects, topics, and subtopics."
      />
      <Suspense fallback={<SyllabusContentSkeleton />}>
        <SyllabusContent />
      </Suspense>
    </div>
  )
}
