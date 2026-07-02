'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { submitSectionResponse } from '../../../actions/submit-section-response'

export type UseSectionSubmitOpts = { sessionId: string; sectionNo: number }

export type UseSectionSubmitResult = {
  submit: (file: File, durationMs: number) => void
  submitting: boolean
  error: string | null
}

/**
 * Owns the §1 Interview submit workflow: builds the FormData the Server Action
 * expects, guards re-entry synchronously, and navigates to the report on success.
 * `useTransition` drives the `submitting` flag for the UI, but the real re-entry
 * lock is the synchronous ref (code-style §6) — `isPending` commits asynchronously
 * and would let a second caller (Submit click + a stray keyboard re-trigger) through.
 */
export function useSectionSubmit({
  sessionId,
  sectionNo,
}: UseSectionSubmitOpts): UseSectionSubmitResult {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const submittedRef = useRef(false)

  function submit(file: File, durationMs: number) {
    if (submittedRef.current) return
    submittedRef.current = true
    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.append('audio', file)
      formData.append('sessionId', sessionId)
      formData.append('sectionNo', String(sectionNo))
      formData.append('durationMs', String(durationMs))

      try {
        const result = await submitSectionResponse(formData)
        if (result.success) {
          router.push(`/app/elp/report/${sessionId}`)
          return
        }
        setError(result.error)
        submittedRef.current = false
      } catch {
        setError('Something went wrong. Please try again.')
        submittedRef.current = false
      }
    })
  }

  return { submit, submitting: isPending, error }
}
