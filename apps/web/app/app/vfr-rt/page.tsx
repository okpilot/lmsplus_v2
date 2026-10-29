import { Suspense } from 'react'
import { QuizTabs } from '@/app/app/quiz/_components/quiz-tabs'
import { PageHeader } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { VfrRtActiveBanners } from './_components/vfr-rt-active-banners'
import { VfrRtSavedPlaceholder } from './_components/vfr-rt-saved-placeholder'
import { VfrRtSetup } from './_components/vfr-rt-setup'

export const dynamic = 'force-dynamic'

export default async function VfrRtPage() {
  const user = await requireAuthUser()

  return (
    <main className="space-y-section">
      <PageHeader
        title="Practice"
        description="Configure and start a VFR Radiotelephony practice session."
      />

      <VfrRtActiveBanners userId={user.id} />

      <QuizTabs
        draftCount={null}
        newLabel="New Practice Session"
        savedLabel="Saved Practice Sessions"
        ariaLabel="Practice options"
        newQuizContent={
          <Suspense fallback={<Skeleton className="h-64 rounded-card" />}>
            <VfrRtSetup />
          </Suspense>
        }
        savedDraftContent={<VfrRtSavedPlaceholder />}
      />
    </main>
  )
}
