import Link from 'next/link'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import type { ActiveInternalExamSession } from '../actions/get-active-internal-exam-session'

type Props = {
  session: ActiveInternalExamSession
}

export function RecoveryBanner({ session }: Readonly<Props>) {
  const subtitle = session.subjectName
    ? `${session.subjectName} — session in progress`
    : 'Session in progress'

  return (
    <Alert
      role="status"
      tone="caution"
      data-testid="internal-exam-recovery-banner"
      className="mx-auto max-w-md"
    >
      <AlertTitle>You have an active internal exam in progress</AlertTitle>
      <AlertDescription className="text-muted-foreground!">{subtitle}</AlertDescription>
      <AlertAction>
        <Link
          href={`/app/quiz/session/${session.sessionId}`}
          className={buttonVariants()}
          data-testid="resume-internal-exam-link"
        >
          Resume internal exam
        </Link>
      </AlertAction>
    </Alert>
  )
}
