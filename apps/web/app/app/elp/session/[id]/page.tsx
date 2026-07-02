import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getOralExamSession } from '@/lib/queries/oral-exam-session'
import { INTERVIEW_PROMPTS } from '../../prompts'
import { OralSectionRunner } from './_components/oral-section-runner'

export default async function OralExamSessionPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireAuthUser()
  const { id } = await params

  const session = await getOralExamSession(id)
  if (!session) redirect('/app/elp')
  // A session that has moved past in_progress (graded, still grading, or a
  // section failed) has nothing left for the recorder to do — send it to the
  // report/pending view instead of re-rendering a fresh, unusable runner.
  if (session.status !== 'in_progress') redirect(`/app/elp/report/${id}`)

  const prompt = INTERVIEW_PROMPTS[0]
  if (!prompt) redirect('/app/elp')

  return (
    <main>
      <OralSectionRunner session={session} prompt={prompt} />
    </main>
  )
}
