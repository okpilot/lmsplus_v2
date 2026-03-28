import { Suspense } from 'react'
import { QuizTabsContent } from './_components/quiz-tabs-content'

export const dynamic = 'force-dynamic'

export default function QuizPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a practice session.
        </p>
      </div>

      <Suspense
        fallback={<div className="h-64 rounded-lg bg-muted animate-pulse max-w-xl mx-auto" />}
      >
        <QuizTabsContent />
      </Suspense>
    </main>
  )
}
