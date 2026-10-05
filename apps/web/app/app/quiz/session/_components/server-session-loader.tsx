'use client'

import type { SessionQuestion } from '@/app/app/_types/session'
import { Skeleton } from '@/components/ui/skeleton'
import type { SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { useServerSessionBootstrap } from '../_hooks/use-server-session-bootstrap'
import { restrictDraftToQuestions } from '../_utils/restrict-draft-to-questions'
import { toRunnerMode } from '../_utils/session-runner-mode'
import { QuizSession } from './quiz-session'

function LoadError({ message }: Readonly<{ message: string }>) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

/** Mounts the runner for a session loaded by id, seeded with what the server holds. */
export function ServerSessionLoader({
  userId,
  entry,
}: Readonly<{ userId: string; entry: SessionEntry }>) {
  const { sessionId, mode, questionIds } = entry
  const bs = useServerSessionBootstrap({ sessionId, questionIds, mode })

  if (bs.error) return <LoadError message={bs.error} />
  if (!bs.questions) return <Skeleton className="mx-auto h-40 w-full max-w-2xl" />

  return (
    <RestoredRunner
      userId={userId}
      entry={entry}
      questions={bs.questions}
      flaggedIds={bs.flaggedIds}
      claimError={bs.claimError}
    />
  )
}

type RunnerProps = {
  userId: string
  entry: SessionEntry
  questions: SessionQuestion[]
  flaggedIds: string[]
  claimError: string | null
}

/** The runner seeded with the server's answers, restricted to the questions actually served. */
function RestoredRunner({
  userId,
  entry,
  questions,
  flaggedIds,
  claimError,
}: Readonly<RunnerProps>) {
  const { seed } = entry
  const restored = restrictDraftToQuestions(
    { draftAnswers: seed.answers, draftCurrentIndex: seed.currentIndex },
    questions,
  )

  return (
    <QuizSession
      userId={userId}
      sessionId={entry.sessionId}
      questions={questions}
      initialFlaggedIds={flaggedIds}
      initialAnswers={restored.answers}
      initialIndex={restored.index}
      initialPinnedIds={seed.pinnedQuestionIds}
      initialActiveMs={seed.activeMs}
      {...toRunnerMode(entry.mode)}
      timeLimitSeconds={entry.timeLimitSeconds}
      passMark={entry.passMark}
      startedAt={entry.startedAt}
      subjectName={entry.subjectName}
      subjectCode={entry.subjectCode}
      initialSaveError={claimError}
    />
  )
}
