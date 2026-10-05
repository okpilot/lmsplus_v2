// Merges and uploads the legacy localStorage copy of this session's answers
// (removal tracked in #1453).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'
import { findLocalOnlyAnswers } from '../_utils/local-answer-upload'
import { readActiveSession } from '../_utils/quiz-session-storage'
import { startLocalUpload } from '../_utils/start-local-upload'

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
 * accepted (null until that is known, at most UPLOAD_WAIT_MS after the upload starts). After the
 * claim, uploads the local-only answers once and clears the local copy only when the upload
 * completed.
 */
export function useLocalAnswerUpload(opts: Readonly<Opts>) {
  const { userId, sessionId, questionIds, serverAnswers, claimed, claimFailed } = opts
  const [localOnly, setLocalOnly] = useState<Answers | null>(null)
  const [settled, setSettled] = useState<Answers | null>(null)
  const startedRef = useRef(false)
  const settledRef = useRef(false)
  const localRef = useRef<Answers>({})
  // The load-time seed: the local copy is read once on mount, not whenever these change identity.
  const seedRef = useRef({ serverAnswers, questionIds })
  seedRef.current = { serverAnswers, questionIds }

  // First outcome wins; later calls (a late upload after the wait limit) are ignored.
  const settle = useCallback((savedIds: readonly string[]) => {
    if (settledRef.current) return
    settledRef.current = true
    const local = Object.fromEntries(
      Object.entries(localRef.current).filter(([id]) => savedIds.includes(id)),
    )
    setSettled({ ...local, ...seedRef.current.serverAnswers })
  }, [])

  useEffect(() => {
    const stored = readActiveSession(userId)
    const found = findLocalOnlyAnswers({ stored, sessionId, ...seedRef.current })
    localRef.current = found
    setLocalOnly(found)
    if (Object.keys(found).length === 0) settle([])
  }, [userId, sessionId, settle])

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
