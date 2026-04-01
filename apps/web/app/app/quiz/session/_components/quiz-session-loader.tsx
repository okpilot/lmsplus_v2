'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { useSessionBootstrap } from '../_hooks/use-session-bootstrap'
import { clampIndex } from '../_utils/clamp-index'
import { QuizSession } from './quiz-session'
import { SessionRecoveryPrompt } from './session-recovery-prompt'

export function QuizSessionLoader({ userId }: { userId: string }) {
  const bs = useSessionBootstrap(userId)

  if (bs.recovery) {
    return (
      <SessionRecoveryPrompt
        subjectName={bs.recovery.subjectName}
        answeredCount={Object.keys(bs.recovery.answers).length}
        totalCount={bs.recovery.questionIds.length}
        onResume={bs.handleRecoveryResume}
        onSave={() => {
          bs.clearResumeError()
          bs.recoveryActions.handleSave()
        }}
        onDiscard={() => {
          bs.clearRecovery()
          bs.recoveryActions.handleDiscard()
        }}
        loading={bs.recoveryActions.loading || bs.resumeLoading}
        error={bs.resumeError ?? bs.recoveryActions.error}
      />
    )
  }

  if (bs.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {bs.error}
      </p>
    )
  }

  if (!bs.session || !bs.questions) {
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

  const questionIdSet = new Set(bs.questions.map((q) => q.id))

  const filteredAnswers = (() => {
    if (!bs.session.draftAnswers) return bs.session.draftAnswers
    return Object.fromEntries(
      Object.entries(bs.session.draftAnswers).filter(([key]) => questionIdSet.has(key)),
    )
  })()

  const filteredFeedback = (() => {
    if (!bs.session.draftFeedback) return undefined
    return new Map(
      Object.entries(bs.session.draftFeedback).filter(([key]) => questionIdSet.has(key)),
    )
  })()

  const clampedIndex =
    bs.session.draftCurrentIndex != null
      ? clampIndex(bs.session.draftCurrentIndex, bs.questions.length)
      : undefined

  return (
    <QuizSession
      userId={userId}
      sessionId={bs.session.sessionId}
      questions={bs.questions}
      initialAnswers={filteredAnswers}
      initialFeedback={filteredFeedback}
      initialIndex={clampedIndex}
      draftId={bs.session.draftId}
      subjectName={bs.session.subjectName}
      subjectCode={bs.session.subjectCode}
    />
  )
}
