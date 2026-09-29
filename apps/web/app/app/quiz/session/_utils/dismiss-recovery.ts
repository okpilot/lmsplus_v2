import { getDismissTarget } from './dismiss-target'
import { type ActiveSession, clearActiveSessionIfCurrent } from './quiz-session-storage'

type DismissRecoveryOpts = {
  userId: string
  recovery: ActiveSession | null
  clearRecovery: () => void
  replace: (path: string) => void
}

/** Drops the recovery prompt without discarding the server session; leaves non-discardable exams. */
export function dismissRecovery({ userId, recovery, clearRecovery, replace }: DismissRecoveryOpts) {
  if (!recovery) return
  const target = getDismissTarget(recovery.examMode)
  clearActiveSessionIfCurrent(userId, recovery.sessionId)
  clearRecovery()
  if (target) replace(target)
}
