import { Suspense } from 'react'
import { requireAdmin } from '@/lib/auth/require-admin'
import { SyllabusContent } from './_components/syllabus-content'
import { SyllabusContentSkeleton } from './_components/syllabus-content-skeleton'

export default async function SyllabusPage() {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Syllabus Manager</h1>
        <p className="text-sm text-muted-foreground">
          Manage the EASA PPL subject hierarchy. Add subjects, topics, and subtopics.
        </p>
      </div>
      <Suspense fallback={<SyllabusContentSkeleton />}>
        <SyllabusContent />
      </Suspense>
    </div>
  )
}
