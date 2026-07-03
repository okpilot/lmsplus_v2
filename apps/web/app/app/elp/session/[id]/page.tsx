import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { nextUnsubmittedSection } from '@/lib/elp/section-progress'
import { getSessionRedirectPath } from '@/lib/elp/session-redirect'
import { getOralExamSession } from '@/lib/queries/oral-exam-session'
import { getSectionPrompt } from '../../prompts'
import { OralSectionRunner } from './_components/oral-section-runner'

export default async function OralExamSessionPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireAuthUser()
  const { id } = await params

  const session = await getOralExamSession(id)
  const redirectPath = getSessionRedirectPath(session, id)
  if (redirectPath) redirect(redirectPath)

  // getSessionRedirectPath returns non-null exactly when `session` is null, so a
  // null redirectPath guarantees session is present at this point.
  const activeSession = session as NonNullable<typeof session>

  // All planned sections submitted while still in_progress (race window; normally
  // the last submit flips status→grading so the redirect gate above fires first).
  const current = nextUnsubmittedSection(activeSession)
  if (!current) redirect(`/app/elp/report/${id}`)

  const prompt = getSectionPrompt(current.type)

  return (
    <main>
      <OralSectionRunner
        key={current.sectionNo}
        session={activeSession}
        section={current}
        prompt={prompt}
      />
    </main>
  )
}
