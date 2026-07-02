'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import type { OralSessionSummary } from '@/lib/queries/oral-exam-session'
import { startOralExam } from '../actions/start-oral-exam'

type Props = Readonly<{ activeSession: OralSessionSummary | null }>

type ResumePromptProps = Readonly<{ activeSession: OralSessionSummary }>

/** Shown when the student already has an in-progress session — presentational only. */
function ElpResumePrompt({ activeSession }: ResumePromptProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">ICAO English Prep</h1>
      <p className="text-sm text-muted-foreground">You have a session in progress.</p>
      <a
        href={`/app/elp/session/${activeSession.id}`}
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Resume your session
      </a>
    </div>
  )
}

/** Entry point for §1 Interview practice: resumes an in-progress session, or
 * starts a new one. Client-only so the Start button can call the Server Action
 * and navigate — the page itself stays a Server Component. */
export function ElpHome({ activeSession }: Props) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6) — `starting` is async state
  // and could let a double-click through before React commits the disabled button.
  const submittedRef = useRef(false)

  async function handleStart() {
    if (submittedRef.current) return
    submittedRef.current = true
    setStarting(true)
    setError(null)

    try {
      const result = await startOralExam('practice')
      if (result.success) {
        router.push(`/app/elp/session/${result.sessionId}`)
        return
      }
      setError(result.error)
      submittedRef.current = false
      setStarting(false)
    } catch {
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
        Practice the §1 Interview — record your answer to a spoken question and get scored feedback.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleStart}
        disabled={starting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {starting ? 'Starting…' : 'Start §1 Interview Practice'}
      </button>
    </div>
  )
}
