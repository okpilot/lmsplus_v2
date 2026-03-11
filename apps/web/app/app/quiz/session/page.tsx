import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { QuizSessionLoader } from './_components/quiz-session-loader'

export const dynamic = 'force-dynamic'

export default async function QuizSessionPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <main>
      <QuizSessionLoader />
    </main>
  )
}
