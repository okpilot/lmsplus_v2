import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { QuizRecoveryBanner } from './_components/quiz-recovery-banner'
import { QuizTabs } from './_components/quiz-tabs'
import { SavedDraftCard } from './_components/saved-draft-card'
import { SubjectsSection } from './_components/subjects-section'
import { loadDrafts } from './actions/load-draft'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { drafts } = await loadDrafts()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a practice session.
        </p>
      </div>

      <QuizRecoveryBanner userId={user.id} />

      <div className="mx-auto max-w-xl">
        <QuizTabs
          draftCount={drafts.length}
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <SubjectsSection userId={user.id} />
            </Suspense>
          }
          savedDraftContent={<SavedDraftCard drafts={drafts} userId={user.id} />}
        />
      </div>
    </main>
  )
}
