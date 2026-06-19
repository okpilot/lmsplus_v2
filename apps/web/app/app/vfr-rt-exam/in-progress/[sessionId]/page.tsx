import { redirect } from 'next/navigation'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { getVfrRtInProgress } from '@/lib/queries/vfr-rt-exam'
import { VfrRtExamRunner } from '../../_components/vfr-rt-exam-runner'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ sessionId: string }> }

export default async function VfrRtInProgressPage({ params }: Props) {
  await requireAuthUser()
  const { sessionId } = await params
  const state = await getVfrRtInProgress(sessionId)

  if (state.status === 'not_found') redirect('/app/vfr-rt-exam')
  if (state.status === 'completed') redirect(`/app/vfr-rt-exam/results/${sessionId}`)

  return (
    <VfrRtExamRunner
      sessionId={state.sessionId}
      startedAt={state.startedAt}
      timeLimitSeconds={state.timeLimitSeconds}
      questions={state.questions}
    />
  )
}
