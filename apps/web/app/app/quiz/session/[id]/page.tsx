import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { ConnectionOverlay } from '../_components/connection-overlay'
import { SessionEntryView } from '../_components/session-entry-view'
import { loadSessionEntry } from '../_loaders/load-session-entry'

export const dynamic = 'force-dynamic'

export default async function QuizSessionByIdPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  const user = await requireAuthUser()
  const entry = await loadSessionEntry(id, user.id)

  return (
    <main>
      <SessionEntryView userId={user.id} entry={entry} />
      <ConnectionOverlay />
    </main>
  )
}
