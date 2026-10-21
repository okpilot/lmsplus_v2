'use client'

import { useState } from 'react'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { AnswerFeedback } from '@/app/app/quiz/types'
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
  // An RSC refresh re-runs the question read (re-shuffling ordering items, or failing): the first
  // successful load sticks; only a failed first load is replaced.
  const [held, setHeld] = useState(runner)
  if ('error' in held && !('error' in runner)) setHeld(runner)
  if ('error' in held) return <LoadError message={held.error} />
  return <ClaimedSession userId={userId} entry={entry} runner={held} />
}

function ClaimedSession({
  userId,
  entry,
  runner,
}: Readonly<{ userId: string; entry: SessionEntry; runner: LoadedData }>) {
  const { claimError } = useServerSessionBootstrap({ userId, sessionId: entry.sessionId })

  return (
    <RestoredRunner
      userId={userId}
      entry={entry}
      questions={runner.questions}
      flaggedIds={runner.flaggedIds}
      feedback={runner.feedback}
      claimError={claimError}
    />
  )
}

type RunnerProps = {
  userId: string
  entry: SessionEntry
  questions: SessionQuestion[]
  flaggedIds: string[]
  feedback: Record<string, AnswerFeedback>
  claimError: string | null
}

/** The runner seeded with the server's answers, restricted to the questions actually served. */
function RestoredRunner({
  userId,
  entry,
  questions,
  flaggedIds,
  feedback,
  claimError,
}: Readonly<RunnerProps>) {
  const { seed } = entry
  const restored = restrictDraftToQuestions(
    {
      draftAnswers: seed.answers,
      draftFeedback: feedback,
      draftCurrentIndex: seed.currentIndex,
    },
    questions,
  )

  return (
    <QuizSession
      userId={userId}
      sessionId={entry.sessionId}
      questions={questions}
      initialFlaggedIds={flaggedIds}
      initialAnswers={restored.answers}
      initialFeedback={restored.feedback}
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
