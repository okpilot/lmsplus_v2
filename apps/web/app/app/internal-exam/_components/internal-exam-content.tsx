import { getActiveInternalExamSession } from '../actions/get-active-internal-exam-session'
import { listAvailableInternalExams, listMyInternalExamHistory } from '../queries'
import { InternalExamTabs } from './internal-exam-tabs'
import { RecoveryBanner } from './recovery-banner'

type Props = {
  userId: string
}

export async function InternalExamContent({ userId }: Readonly<Props>) {
  const [available, history, activeResult] = await Promise.all([
    listAvailableInternalExams(),
    listMyInternalExamHistory(),
    getActiveInternalExamSession(),
  ])

  const activeSessions = activeResult.success ? activeResult.sessions : []

  return (
    <div className="space-y-4">
      {activeSessions.map((session) => (
        <RecoveryBanner key={session.sessionId} userId={userId} session={session} />
      ))}
      <InternalExamTabs available={available} history={history} userId={userId} />
    </div>
  )
}
