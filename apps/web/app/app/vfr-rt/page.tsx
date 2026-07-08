import { Suspense } from 'react'
import { QuizRecoveryBanner } from '@/app/app/quiz/_components/quiz-recovery-banner'
import { QuizTabs } from '@/app/app/quiz/_components/quiz-tabs'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { VfrRtSavedPlaceholder } from './_components/vfr-rt-saved-placeholder'
import { VfrRtSetup } from './_components/vfr-rt-setup'

export const dynamic = 'force-dynamic'

export default async function VfrRtPage() {
  const user = await requireAuthUser()

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Practice</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a VFR Radiotelephony practice session.
        </p>
      </div>

      <QuizRecoveryBanner userId={user.id} />

      <div className="mx-auto max-w-xl">
        <QuizTabs
          draftCount={null}
          newLabel="New Practice Session"
          savedLabel="Saved Practice Sessions"
          ariaLabel="Practice options"
          newQuizContent={
            <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-muted" />}>
              <VfrRtSetup userId={user.id} />
            </Suspense>
          }
          savedDraftContent={<VfrRtSavedPlaceholder />}
        />
      </div>
    </main>
  )
}
