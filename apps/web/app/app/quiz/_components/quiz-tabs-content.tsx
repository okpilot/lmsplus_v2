import { Suspense } from 'react'
import { loadDrafts } from '../actions/load-draft'
import { QuizTabs } from './quiz-tabs'
import { SavedDraftCard } from './saved-draft-card'
import { SubjectsSection } from './subjects-section'

export async function QuizTabsContent({ userId }: { userId: string }) {
  const { drafts } = await loadDrafts()

  return (
    <div className="mx-auto max-w-xl">
      <QuizTabs
        draftCount={drafts.length}
        newQuizContent={
          <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
            <SubjectsSection userId={userId} />
          </Suspense>
        }
        savedDraftContent={<SavedDraftCard drafts={drafts} />}
      />
    </div>
  )
}
