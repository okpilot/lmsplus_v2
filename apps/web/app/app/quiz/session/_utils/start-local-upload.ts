// Starts the one-time upload of the legacy local copy for the loader hook (removal tracked in #1453).
import type { DraftAnswer } from '../../types'
import { uploadLocalAnswers } from './local-answer-upload'
import { clearActiveSessionIfCurrent } from './quiz-session-storage'

/** Longest the runner waits for the upload; it keeps running in the background after that. */
export const UPLOAD_WAIT_MS = 10_000

type Answers = Record<string, DraftAnswer>
type Settle = (savedIds: readonly string[]) => void

export function startLocalUpload(opts: {
  userId: string
  sessionId: string
  answers: Answers
  settle: Settle
}) {
  const { userId, sessionId, answers, settle } = opts
  const savedIds = new Set<string>()
  // After the wait the mounted runner owns the local copy, so a late completion must not clear it.
  let timedOut = false
  const onSaved = (id: string) => savedIds.add(id)
  const timer = setTimeout(() => {
    timedOut = true
    settle([...savedIds])
  }, UPLOAD_WAIT_MS)
  const upload =
    Object.keys(answers).length > 0
      ? uploadLocalAnswers({ sessionId, answers, onSaved, shouldStop: () => timedOut })
      : Promise.resolve({ saved: [] as string[], complete: true })
  upload
    .then((result) => {
      if (timedOut) return
      clearTimeout(timer)
      settle(result.saved)
      if (result.complete) clearActiveSessionIfCurrent(userId, sessionId)
    })
    .catch(() => {
      if (timedOut) return
      clearTimeout(timer)
      settle([...savedIds])
    })
}
