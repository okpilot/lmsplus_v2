'use client'

import { useRouter } from 'next/navigation'
import { sessionHandoffKey } from '../../quiz/session/_utils/quiz-session-storage'
import type { ActiveInternalExamSession } from '../actions/get-active-internal-exam-session'

type Props = {
  userId: string
  session: ActiveInternalExamSession
}

export function RecoveryBanner({ userId, session }: Readonly<Props>) {
  const router = useRouter()
  const subtitle = session.subjectName
    ? `${session.subjectName} — session in progress`
    : 'Session in progress'

  function handleResume() {
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify({
          userId,
          sessionId: session.sessionId,
          questionIds: session.questionIds,
          subjectName: session.subjectName,
          subjectCode: session.subjectCode,
          mode: 'exam',
          examMode: 'internal_exam',
          timeLimitSeconds: session.timeLimitSeconds,
          passMark: session.passMark,
          startedAt: session.startedAt,
        }),
      )
    } catch (err) {
      console.error('[recovery-banner] sessionStorage handoff failed:', err)
      // Fall through — quiz-session-loader has its own error UX.
    }
    router.push('/app/quiz/session')
  }

  return (
    <div
      role="status"
      data-testid="internal-exam-recovery-banner"
      className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
    >
      <p className="text-sm font-medium text-foreground">
        You have an active internal exam in progress
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-3">
        <button
          type="button"
          onClick={handleResume}
          className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
          data-testid="resume-internal-exam-link"
        >
          Resume internal exam
        </button>
      </div>
    </div>
  )
}
