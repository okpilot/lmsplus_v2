import { Suspense } from 'react'
import { QuizTabs } from './_components/quiz-tabs'
import { SavedDraftCard } from './_components/saved-draft-card'
import { SubjectsSection } from './_components/subjects-section'
import { loadDrafts } from './actions/load-draft'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const { drafts } = await loadDrafts()

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
          draftCount={drafts.length}
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <SubjectsSection />
            </Suspense>
          }
          savedDraftContent={<SavedDraftCard drafts={drafts} />}
        />
      </div>
    </main>
  )
}
