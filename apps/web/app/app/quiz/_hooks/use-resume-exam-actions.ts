'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { buildDiscardHandler, buildResumeHandler } from './resume-exam-handlers'

/**
 * Owns the resume/discard workflow state for the ResumeExamBanner. The handler
 * logic (the one-shot discard re-entry guard, the discardQuiz mutation, the
 * resume handoff write) lives in resume-exam-handlers.ts; this hook declares
 * the state and wires it to the builders. The banner renders.
 */
export function useResumeExamActions(
  opts: Readonly<{ userId: string; exam?: ActiveExamSession; activeSessionId: string }>,
) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  // Synchronous one-shot re-entry guard on discard (code-style §6) — see the builder.
  const discardingRef = useRef(false)
  const deps = { ...opts, router, setLoading, setError, setDiscarded, discardingRef }
  return {
    loading,
    error,
    discarded,
    handleResume: buildResumeHandler(deps),
    handleDiscard: buildDiscardHandler(deps),
  }
}
