import { withTimeout } from '@/lib/utils/with-timeout'
import { getActiveInternalExamSession } from '../actions/get-active-internal-exam-session'
import { listAvailableInternalExams, listMyInternalExamHistory } from '../queries'
import { InternalExamTabs } from './internal-exam-tabs'
import { RecoveryBanner } from './recovery-banner'

// #911: guards against a hung query streaming the Suspense skeleton forever —
// a timeout resolves to a failure-shaped fallback so the existing loadFailed
// banner renders instead.
export const INTERNAL_EXAM_LOAD_TIMEOUT_MS = 10_000

type Props = {
  userId: string
}

export async function InternalExamContent({ userId }: Readonly<Props>) {
  const [availableResult, historyResult, activeResult] = await Promise.all([
    withTimeout(listAvailableInternalExams(), INTERNAL_EXAM_LOAD_TIMEOUT_MS, {
      success: false,
      data: [],
    }),
    withTimeout(listMyInternalExamHistory(), INTERNAL_EXAM_LOAD_TIMEOUT_MS, {
      success: false,
      data: [],
    }),
    withTimeout(getActiveInternalExamSession(), INTERNAL_EXAM_LOAD_TIMEOUT_MS, {
      success: false as const,
      error: 'timed out',
    }),
  ])

  const activeSessions = activeResult.success ? activeResult.sessions : []
  // A failed active-session fetch also degrades silently (no recovery banner shown),
  // so surface it in the error banner too — otherwise a mid-exam recovery failure
  // would leave the student with no signal at all.
  const loadFailed = !availableResult.success || !historyResult.success || !activeResult.success

  return (
    <div className="space-y-4">
      {loadFailed && (
        <div
          role="alert"
          className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          We couldn&apos;t load your internal exams right now. Please refresh — if the issue
          persists, contact support.
        </div>
      )}
      {activeSessions.map((session) => (
        <RecoveryBanner key={session.sessionId} userId={userId} session={session} />
      ))}
      <InternalExamTabs
        available={availableResult.data}
        history={historyResult.data}
        userId={userId}
      />
    </div>
  )
}
