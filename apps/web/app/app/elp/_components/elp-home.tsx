'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { OralSessionSummary } from '@/lib/queries/oral-exam-session'
import { startOralExam } from '../actions/start-oral-exam'

type Props = Readonly<{ activeSession: OralSessionSummary | null }>

type ResumePromptProps = Readonly<{ activeSession: OralSessionSummary }>

/** Shown when the student already has an in-progress session — presentational only. */
function ElpResumePrompt({ activeSession }: ResumePromptProps) {
  const modeLabel = activeSession.mode === 'mock' ? 'Mock Exam' : '§1 Interview Practice'
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">ICAO English Prep</h1>
      <p className="text-sm text-muted-foreground">You have a session in progress.</p>
      <Link
        href={`/app/elp/session/${activeSession.id}`}
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Resume your {modeLabel}
      </Link>
    </div>
  )
}

/** Entry point for ELP: resumes an in-progress session, or starts a new §1
 * Interview practice or a full Mock Exam. Client-only so the Start buttons can
 * call the Server Action and navigate — the page itself stays a Server Component. */
export function ElpHome({ activeSession }: Props) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6) — `starting` is async state
  // and could let a double-click (or the two Start buttons) through before React
  // commits the disabled buttons.
  const submittedRef = useRef(false)

  async function handleStart(mode: 'practice' | 'mock') {
    if (submittedRef.current) return
    submittedRef.current = true
    setStarting(true)
    setError(null)

    try {
      const result = await startOralExam(mode)
      if (result.success) {
        router.push(`/app/elp/session/${result.sessionId}`)
        return
      }
      setError(result.error)
      submittedRef.current = false
      setStarting(false)
    } catch (err) {
      console.error('[ElpHome] startOralExam threw:', err)
      setError('Something went wrong. Please try again.')
      submittedRef.current = false
      setStarting(false)
    }
  }

  if (activeSession) {
    return <ElpResumePrompt activeSession={activeSession} />
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">ICAO English Prep</h1>
      <p className="text-sm text-muted-foreground">
        Practice the §1 Interview, or sit the full 5-section Mock Exam — record your spoken answers
        and get scored feedback.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleStart('practice')}
          disabled={starting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start §1 Interview Practice'}
        </button>
        <button
          type="button"
          onClick={() => handleStart('mock')}
          disabled={starting}
          className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start Mock Exam'}
        </button>
      </div>
    </div>
  )
}
