// Merges and uploads the legacy localStorage copy of this session's answers
// (removal tracked in #1453).
import { useEffect, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'
import { findLocalOnlyAnswers } from '../_utils/local-answer-upload'
import { readActiveSession } from '../_utils/quiz-session-storage'
import { startLocalUpload } from '../_utils/start-local-upload'
import { useUploadSettle } from './use-upload-settle'

type Opts = {
  userId: string
  sessionId: string
  questionIds: readonly string[]
  serverAnswers: Record<string, DraftAnswer>
  /** The tab's claim of the session has landed without error. */
  claimed: boolean
  /** The tab's claim of the session failed. */
  claimFailed: boolean
}

type Answers = Record<string, DraftAnswer>

/**
 * Returns the server answers plus the answers only this browser held that the server has since
 * accepted (null until the upload has finished or stopped). After the claim, uploads the
 * local-only answers once; it sends no further answers after UPLOAD_WAIT_MS, and the local copy is
 * cleared only when every answer was sent.
 */
export function useLocalAnswerUpload(opts: Readonly<Opts>) {
  const { userId, sessionId, questionIds, serverAnswers, claimed, claimFailed } = opts
  const [localOnly, setLocalOnly] = useState<Answers | null>(null)
  const startedRef = useRef(false)
  // The load-time seed: the local copy is read once on mount, not whenever these change identity.
  const seedRef = useRef({ serverAnswers, questionIds })
  seedRef.current = { serverAnswers, questionIds }
  const { settled, settle, localRef } = useUploadSettle(seedRef)

  useEffect(() => {
    const stored = readActiveSession(userId)
    const found = findLocalOnlyAnswers({ stored, sessionId, ...seedRef.current })
    localRef.current = found
    setLocalOnly(found)
    if (Object.keys(found).length === 0) settle([])
  }, [userId, sessionId, settle, localRef])

  useEffect(() => {
    if (localOnly === null || startedRef.current) return
    if (claimFailed) return settle([])
    if (!claimed) return
    if (readActiveSession(userId)?.sessionId !== sessionId) return settle([])
    startedRef.current = true
    startLocalUpload({ userId, sessionId, answers: localOnly, settle })
  }, [claimed, claimFailed, localOnly, userId, sessionId, settle])

  return { answers: settled }
}
