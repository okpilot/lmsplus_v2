import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/heading'
import { SyllabusContent } from './_components/syllabus-content'
import { SyllabusContentSkeleton } from './_components/syllabus-content-skeleton'

export default function SyllabusPage() {
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
