'use client'

import {
  type QuizMode as DbQuizMode,
  isDiscardableExamMode,
  MODE_LABELS,
} from '@/lib/constants/exam-modes'
import type { SessionMode } from '../../session-types'
import { DiscardControl, DismissControl } from './session-recovery-controls'

type SessionRecoveryPromptProps = Readonly<{
  subjectName?: string
  answeredCount: number
  totalCount: number
  onResume: () => void
  onSave: () => void
  onDiscard: () => void
  // Local-only exit for modes the server refuses to discard (never calls discardQuiz).
  onDismiss?: () => void
  loading: boolean
  error: string | null
  mode?: SessionMode
  examMode?: DbQuizMode
}>

export function SessionRecoveryPrompt({
  subjectName,
  answeredCount,
  totalCount,
  onResume,
  onSave,
  onDiscard,
  onDismiss,
  loading,
  error,
  mode,
  examMode,
}: SessionRecoveryPromptProps) {
  const isExam = mode === 'exam'
  const canDiscard = isDiscardableExamMode(examMode)
  const examLabel = MODE_LABELS[examMode ?? 'mock_exam'] ?? 'Exam'
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">
        {isExam ? `Resume your ${examLabel}?` : 'Resume your quiz?'}
      </h2>
      {subjectName && (
        <p className="mt-1 text-sm text-muted-foreground">You were answering {subjectName}.</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {answeredCount} of {totalCount} questions answered
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onResume}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Resume
        </button>
        {!isExam && (
          // Practice Exam answers are buffered into a server session that auto-submits
          // at deadline — saving a draft would desync from the server clock.
          <button
            type="button"
            onClick={onSave}
            disabled={loading}
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            Save for Later
          </button>
        )}
        {canDiscard ? (
          <DiscardControl
            isExam={isExam}
            examLabel={examLabel}
            loading={loading}
            onDiscard={onDiscard}
          />
        ) : (
          <DismissControl loading={loading} onDismiss={onDismiss} />
        )}
      </div>
    </div>
  )
}
