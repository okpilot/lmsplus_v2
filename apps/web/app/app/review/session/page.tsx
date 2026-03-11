import { createServerSupabaseClient } from '@repo/db/server'
import { redirect } from 'next/navigation'
import { ReviewSessionLoader } from './_components/review-session-loader'

export const dynamic = 'force-dynamic'

export default async function ReviewSessionPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  return (
    <main>
      <ReviewSessionLoader />
    </main>
  )
}
