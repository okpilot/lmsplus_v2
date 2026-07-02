'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { discardOralExam } from '../../actions/discard-oral-exam'

type Props = Readonly<{ sessionId: string }>

/**
 * "Start over" control for the scoring-failed panel. Discards the stuck
 * session (soft-delete via `discardOralExam`) so the single-active-session
 * guard no longer blocks a fresh attempt, then returns to the entry page.
 * Client-only so it can call the Server Action and navigate — the parent
 * panel stays a Server Component.
 */
export function DiscardAndRestartButton({ sessionId }: Props) {
  const router = useRouter()
  const [discarding, setDiscarding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard (code-style §6) — `discarding` is
  // async state and could let a double-click through before React commits
  // the disabled button.
  const submittedRef = useRef(false)

  async function handleClick() {
    if (submittedRef.current) return
    submittedRef.current = true
    setDiscarding(true)
    setError(null)

    try {
      // Await the critical mutation so it settles before the terminal
      // navigation — otherwise the session could still read as active when
      // /app/elp re-fetches it (code-style §6).
      const result = await discardOralExam({ sessionId })
      if (result.success) {
        router.push('/app/elp')
        return
      }
      setError(result.error)
      submittedRef.current = false
      setDiscarding(false)
    } catch {
      setError('Something went wrong. Please try again.')
      submittedRef.current = false
      setDiscarding(false)
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={discarding}
        className="inline-block text-sm font-medium text-primary underline underline-offset-4 disabled:opacity-50"
      >
        {discarding ? 'Starting over…' : 'Start over'}
      </button>
    </div>
  )
}
