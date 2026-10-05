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
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure and start a practice session.
        </p>
      </div>

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
