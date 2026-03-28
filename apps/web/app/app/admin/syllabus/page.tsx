import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { SyllabusContent } from './_components/syllabus-content'

function SyllabusContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

export default function SyllabusPage() {
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
