import { Suspense } from 'react'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { LookupErrorAlerts } from './_components/lookup-error-alerts'
import { QuizPageBanners } from './_components/quiz-page-banners'
import { QuizTabs } from './_components/quiz-tabs'
import { SavedDraftCard } from './_components/saved-draft-card'
import { SubjectsSection } from './_components/subjects-section'
import { loadQuizPageData } from './_loaders/load-quiz-page-data'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const user = await requireAuthUser()
  const {
    drafts,
    savedSessions,
    savedLookupFailed,
    examLookupFailed,
    activeExams,
    orphanedIds,
    expiredIds,
    practiceLookupFailed,
    activePractice,
  } = await loadQuizPageData(user.id)

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a practice session.
        </p>
      </div>

      <LookupErrorAlerts
        examFailed={examLookupFailed}
        practiceFailed={practiceLookupFailed}
        savedFailed={savedLookupFailed}
      />

      <QuizPageBanners
        userId={user.id}
        activeExams={activeExams}
        orphanedIds={orphanedIds}
        expiredIds={expiredIds}
        activePractice={activePractice}
      />

      <div className="mx-auto max-w-xl">
        <QuizTabs
          draftCount={drafts.length + savedSessions.length}
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <SubjectsSection userId={user.id} />
            </Suspense>
          }
          savedDraftContent={<SavedDraftCard drafts={drafts} savedSessions={savedSessions} />}
        />
      </div>
    </main>
  )
}
