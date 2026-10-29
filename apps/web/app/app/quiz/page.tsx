import { PageHeader } from '@/components/ui/heading'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { LookupErrorAlerts } from './_components/lookup-error-alerts'
import { QuizPageBanners } from './_components/quiz-page-banners'
import { QuizPageTabs } from './_components/quiz-page-tabs'
import { loadQuizPageData } from './_loaders/load-quiz-page-data'

export const dynamic = 'force-dynamic'

export default async function QuizPage() {
  const user = await requireAuthUser()
  const data = await loadQuizPageData(user.id)

  return (
    <main className="space-y-section">
      <PageHeader title="Quiz" description="Configure and start a practice session." />

      <LookupErrorAlerts
        examFailed={data.examLookupFailed}
        practiceFailed={data.practiceLookupFailed}
        savedFailed={data.savedLookupFailed}
      />

      <QuizPageBanners userId={user.id} {...data} />

      <QuizPageTabs userId={user.id} {...data} />
    </main>
  )
}
