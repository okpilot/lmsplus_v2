import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { QuizSessionLoader } from './_components/quiz-session-loader'

export const dynamic = 'force-dynamic'

export default async function QuizSessionPage() {
  const user = await requireAuthUser()

  return (
    <main>
      <QuizSessionLoader key={user.id} userId={user.id} />
    </main>
  )
}
