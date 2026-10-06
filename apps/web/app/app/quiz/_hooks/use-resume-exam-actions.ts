'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { buildDiscardHandler } from './resume-exam-handlers'

/**
 * Owns the discard workflow state for the ResumeExamBanner. The handler logic (the
 * one-shot re-entry guard and the discardQuiz mutation) lives in resume-exam-handlers.ts;
 * this hook declares the state and wires it to the builder. The banner renders; Resume
 * is a plain link to the session page.
 */
export function useResumeExamActions(opts: Readonly<{ userId: string; activeSessionId: string }>) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  // Synchronous one-shot re-entry guard on discard (code-style §6) — see the builder.
  const discardingRef = useRef(false)
  const deps = { ...opts, router, setLoading, setError, setDiscarded, discardingRef }
  return { loading, error, discarded, handleDiscard: buildDiscardHandler(deps) }
}
