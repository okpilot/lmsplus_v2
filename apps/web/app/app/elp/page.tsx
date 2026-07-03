import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getActiveOralExamSession } from '@/lib/queries/oral-exam-session'
import { ElpHome } from './_components/elp-home'

export const dynamic = 'force-dynamic'

export default async function ElpPage() {
  await requireAuthUser()
  const activeSession = await getActiveOralExamSession()

  return (
    <main>
      <ElpHome activeSession={activeSession} />
    </main>
  )
}
