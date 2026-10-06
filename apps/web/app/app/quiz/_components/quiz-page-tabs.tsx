import { Suspense } from 'react'
import type { QuizPageData } from '../_loaders/load-quiz-page-data'
import { QuizTabs } from './quiz-tabs'
import { SavedDraftCard } from './saved-draft-card'
import { SubjectsSection } from './subjects-section'

export function QuizPageTabs({
  userId,
  drafts,
  savedSessions,
  savedTabCount,
  savedLookupFailed,
}: Readonly<
  { userId: string } & Pick<
    QuizPageData,
    'drafts' | 'savedSessions' | 'savedTabCount' | 'savedLookupFailed'
  >
>) {
  return (
    <div className="mx-auto max-w-xl">
      <QuizTabs
        draftCount={savedTabCount}
        newQuizContent={
          <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
            <SubjectsSection userId={userId} />
          </Suspense>
        }
        savedDraftContent={
          <SavedDraftCard
            drafts={drafts}
            savedSessions={savedSessions}
            savedLookupFailed={savedLookupFailed}
          />
        }
      />
    </div>
  )
}
