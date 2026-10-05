import Link from 'next/link'
import type { ActiveInternalExamSession } from '../actions/get-active-internal-exam-session'

type Props = {
  session: ActiveInternalExamSession
}

export function RecoveryBanner({ session }: Readonly<Props>) {
  const subtitle = session.subjectName
    ? `${session.subjectName} — session in progress`
    : 'Session in progress'

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
        <Link
          href={`/app/quiz/session/${session.sessionId}`}
          className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
          data-testid="resume-internal-exam-link"
        >
          Resume internal exam
        </Link>
      </div>
    </div>
  )
}
