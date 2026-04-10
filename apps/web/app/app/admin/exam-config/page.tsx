import { Suspense } from 'react'
import { ExamConfigContent } from './_components/exam-config-content'

export default function ExamConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exam Configuration</h1>
        <p className="text-sm text-muted-foreground">
          Configure practice exam parameters for each EASA PPL subject.
        </p>
      </div>
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
        <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
