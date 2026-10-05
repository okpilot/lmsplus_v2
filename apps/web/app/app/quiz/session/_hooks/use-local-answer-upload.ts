// Merges and uploads the legacy localStorage copy of this session's answers
// (removal tracked in #1453).
import { useEffect, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'
import { findLocalOnlyAnswers, uploadLocalAnswers } from '../_utils/local-answer-upload'
import { clearActiveSession, readActiveSession } from '../_utils/quiz-session-storage'

type Opts = {
  userId: string
  sessionId: string
  questionIds: readonly string[]
  serverAnswers: Record<string, DraftAnswer>
  /** The tab's claim of the session has landed without error. */
  claimed: boolean
}

/**
 * Returns the server answers plus any answer only this browser held (null until the local copy
 * has been read). After the claim, uploads those answers once and clears the copy only when
 * every one was saved.
 */
export function useLocalAnswerUpload(opts: Readonly<Opts>) {
  const { userId, sessionId, questionIds, serverAnswers, claimed } = opts
  const [localOnly, setLocalOnly] = useState<Record<string, DraftAnswer> | null>(null)
  const startedRef = useRef(false)
  // The load-time seed: the local copy is read once on mount, not whenever these change identity.
  const seedRef = useRef({ serverAnswers, questionIds })
  seedRef.current = { serverAnswers, questionIds }

  useEffect(() => {
    const stored = readActiveSession(userId)
    setLocalOnly(findLocalOnlyAnswers({ stored, sessionId, ...seedRef.current }))
  }, [userId, sessionId])

  useEffect(() => {
    if (!claimed || localOnly === null || startedRef.current) return
    if (readActiveSession(userId)?.sessionId !== sessionId) return
    startedRef.current = true
    const pending = Object.keys(localOnly).length > 0
    const upload = pending
      ? uploadLocalAnswers({ sessionId, answers: localOnly })
      : Promise.resolve(true)
    upload.then((ok) => (ok ? clearActiveSession(userId) : undefined)).catch(() => undefined)
  }, [claimed, localOnly, userId, sessionId])

  return { answers: localOnly === null ? null : { ...localOnly, ...serverAnswers } }
}
