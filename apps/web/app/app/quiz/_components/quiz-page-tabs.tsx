import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { QuizPageData } from '../_loaders/load-quiz-page-data'
import { QuizTabs } from './quiz-tabs'
import { RefreshOnReturn } from './refresh-on-return'
import { SavedDraftCard } from './saved-draft-card'
import SubjectsErrorBoundary from './subjects-error-boundary'
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
    <div>
      <RefreshOnReturn />
      <QuizTabs
        draftCount={savedTabCount}
        newQuizContent={
          <SubjectsErrorBoundary>
            <Suspense fallback={<Skeleton className="h-skeleton-chart rounded-card" />}>
              <SubjectsSection userId={userId} />
            </Suspense>
          </SubjectsErrorBoundary>
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
