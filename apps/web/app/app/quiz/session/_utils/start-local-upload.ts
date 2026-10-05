// Starts the one-time upload of the legacy local copy for the loader hook (removal tracked in #1453).
import type { DraftAnswer } from '../../types'
import { uploadLocalAnswers } from './local-answer-upload'
import { clearActiveSessionIfCurrent } from './quiz-session-storage'

/** Longest the runner waits for the upload; it keeps running in the background after that. */
export const UPLOAD_WAIT_MS = 10_000

export type Answers = Record<string, DraftAnswer>
export type Settle = (savedIds: readonly string[]) => void

export function startLocalUpload(opts: {
  userId: string
  sessionId: string
  answers: Answers
  settle: Settle
}) {
  const { userId, sessionId, answers, settle } = opts
  const savedIds = new Set<string>()
  const timer = setTimeout(() => settle([...savedIds]), UPLOAD_WAIT_MS)
  const upload =
    Object.keys(answers).length > 0
      ? uploadLocalAnswers({ sessionId, answers, onSaved: (id) => savedIds.add(id) })
      : Promise.resolve({ saved: [] as string[], complete: true })
  upload
    .then((result) => {
      clearTimeout(timer)
      settle(result.saved)
      if (result.complete) clearActiveSessionIfCurrent(userId, sessionId)
    })
    .catch(() => {
      clearTimeout(timer)
      settle([...savedIds])
    })
}
