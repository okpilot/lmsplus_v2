'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { SessionEntry } from '@/lib/queries/load-quiz-session-state'
import { useLocalAnswerUpload } from '../_hooks/use-local-answer-upload'
import { useServerSessionBootstrap } from '../_hooks/use-server-session-bootstrap'
import { restrictDraftToQuestions } from '../_utils/restrict-draft-to-questions'
import { toRunnerMode } from '../_utils/session-runner-mode'
import { QuizSession } from './quiz-session'

/** Mounts the runner for a session loaded by id, seeded with what the server holds. */
export function ServerSessionLoader({
  userId,
  entry,
}: Readonly<{ userId: string; entry: SessionEntry }>) {
  const { sessionId, mode, questionIds, seed } = entry
  const bs = useServerSessionBootstrap({ sessionId, questionIds, mode })
  const { answers } = useLocalAnswerUpload({
    userId,
    sessionId,
    questionIds,
    serverAnswers: seed.answers,
    claimed: !!bs.questions && !bs.claimError,
  })

  if (bs.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {bs.error}
      </p>
    )
  }
  if (!bs.questions || !answers) return <Skeleton className="mx-auto h-40 w-full max-w-2xl" />

  const restored = restrictDraftToQuestions(
    { draftAnswers: answers, draftCurrentIndex: seed.currentIndex },
    bs.questions,
  )

  return (
    <QuizSession
      userId={userId}
      sessionId={sessionId}
      questions={bs.questions}
      initialFlaggedIds={bs.flaggedIds}
      initialAnswers={restored.answers}
      initialIndex={restored.index}
      initialPinnedIds={seed.pinnedQuestionIds}
      initialActiveMs={seed.activeMs}
      {...toRunnerMode(mode)}
      timeLimitSeconds={entry.timeLimitSeconds}
      passMark={entry.passMark}
      startedAt={entry.startedAt}
      subjectName={entry.subjectName}
      subjectCode={entry.subjectCode}
      initialSaveError={bs.claimError}
    />
  )
}
