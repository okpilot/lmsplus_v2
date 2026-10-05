// Starts the one-time upload of the legacy local copy for the loader hook (removal tracked in #1453).
import type { DraftAnswer } from '../../types'
import { uploadLocalAnswers } from './local-answer-upload'
import { clearActiveSessionIfCurrent } from './quiz-session-storage'

/** After this the upload sends no further answers; the runner opens once the save in progress returns. */
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
  let stopped = false
  const onSaved = (id: string) => savedIds.add(id)
  const timer = setTimeout(() => {
    stopped = true
  }, UPLOAD_WAIT_MS)
  const upload =
    Object.keys(answers).length > 0
      ? uploadLocalAnswers({ sessionId, answers, onSaved, shouldStop: () => stopped })
      : Promise.resolve({ saved: [] as string[], complete: true })
  // The runner mounts on settle, so the copy is cleared first and no upload save runs after it.
  upload
    .then((result) => {
      clearTimeout(timer)
      if (result.complete) clearActiveSessionIfCurrent(userId, sessionId)
      settle(result.saved)
    })
    .catch(() => {
      clearTimeout(timer)
      settle([...savedIds])
    })
}
