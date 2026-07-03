import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getSessionRedirectPath } from '@/lib/elp/session-redirect'
import { getOralExamSession } from '@/lib/queries/oral-exam-session'
import { INTERVIEW_PROMPTS } from '../../prompts'
import { OralSectionRunner } from './_components/oral-section-runner'

export default async function OralExamSessionPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireAuthUser()
  const { id } = await params

  const session = await getOralExamSession(id)
  const redirectPath = getSessionRedirectPath(session, id)
  if (redirectPath) redirect(redirectPath)

  const prompt = INTERVIEW_PROMPTS[0]
  if (!prompt) redirect('/app/elp')

  // getSessionRedirectPath returns non-null exactly when `session` is null, so a
  // null redirectPath guarantees session is present at this point.
  const activeSession = session as NonNullable<typeof session>

  return (
    <main>
      <OralSectionRunner session={activeSession} prompt={prompt} />
    </main>
  )
}
