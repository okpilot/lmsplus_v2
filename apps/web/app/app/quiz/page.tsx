import { getSubjectsWithCounts } from '@/lib/queries/quiz'
import { Suspense } from 'react'
import { QuizConfigForm } from './_components/quiz-config-form'
import { QuizTabs } from './_components/quiz-tabs'
import { SavedDraftCard } from './_components/saved-draft-card'
import { loadDrafts } from './actions/load-draft'

export const dynamic = 'force-dynamic'

async function SubjectsSection() {
  const subjects = await getSubjectsWithCounts()
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <QuizConfigForm subjects={subjects} />
    </div>
  )
}

async function DraftsSection() {
  const { drafts } = await loadDrafts()
  return <SavedDraftCard drafts={drafts} />
}

export default function QuizPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test your knowledge with a randomized quiz on any subject.
        </p>
      </div>

      <div className="mx-auto max-w-md">
        <QuizTabs
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <SubjectsSection />
            </Suspense>
          }
          savedDraftContent={
            <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-muted" />}>
              <DraftsSection />
            </Suspense>
          }
        />
      </div>
    </main>
  )
}
