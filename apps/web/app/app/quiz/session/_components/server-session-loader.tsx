'use client'

import { useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import { Skeleton } from '@/components/ui/skeleton'
import type { SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { useServerSessionBootstrap } from '../_hooks/use-server-session-bootstrap'
import type { SessionRunnerData } from '../_loaders/load-session-entry'
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

type LoadedData = Extract<SessionRunnerData, { questions: SessionQuestion[] }>

/** Mounts the runner for a session loaded by id, seeded with what the server holds. */
export function ServerSessionLoader({
  userId,
  entry,
  runner,
}: Readonly<{ userId: string; entry: SessionEntry; runner: SessionRunnerData }>) {
  // An RSC refresh re-runs the question read (re-shuffling ordering items, or failing): the first load sticks.
  const [first] = useState(runner)
  if ('error' in first) return <LoadError message={first.error} />
  return <ClaimedSession userId={userId} entry={entry} runner={first} />
}

function ClaimedSession({
  userId,
  entry,
  runner,
}: Readonly<{ userId: string; entry: SessionEntry; runner: LoadedData }>) {
  const bs = useServerSessionBootstrap({ userId, sessionId: entry.sessionId, runner })
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
