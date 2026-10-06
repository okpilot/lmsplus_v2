'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useSessionBootstrap } from '../_hooks/use-session-bootstrap'
import { restrictDraftToQuestions } from '../_utils/restrict-draft-to-questions'
import { QuizSession } from './quiz-session'

function LoaderSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 w-full rounded-md" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function QuizSessionLoader({ userId }: Readonly<{ userId: string }>) {
  const bs = useSessionBootstrap(userId)

  if (bs.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {bs.error}
      </p>
    )
  }

  if (!bs.session || !bs.questions) {
    return <LoaderSkeleton />
  }

  const draft = restrictDraftToQuestions(bs.session, bs.questions)

  return (
    <QuizSession
      userId={userId}
      sessionId={bs.session.sessionId}
      questions={bs.questions}
      initialFlaggedIds={bs.flaggedIds}
      initialAnswers={draft.answers}
      initialFeedback={draft.feedback}
      initialIndex={draft.index}
      subjectName={bs.session.subjectName}
      subjectCode={bs.session.subjectCode}
      mode={bs.session.mode}
      examMode={bs.session.examMode}
      timeLimitSeconds={bs.session.timeLimitSeconds}
      passMark={bs.session.passMark}
      startedAt={bs.session.startedAt}
      initialSaveError={bs.claimError}
    />
  )
}
