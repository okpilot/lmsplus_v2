'use client'

import Link from 'next/link'
import type { OralSessionSummary } from '@/lib/queries/oral-exam-session'
import { useOralExamStart } from '../_hooks/use-oral-exam-start'
import { StartButtons } from './start-buttons'

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
  const { starting, error, start } = useOralExamStart()

  if (activeSession) {
    return <ElpResumePrompt activeSession={activeSession} />
  }

  return <StartButtons onStart={start} starting={starting} error={error} />
}
