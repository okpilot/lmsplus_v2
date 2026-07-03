'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { submitSectionResponse } from '../../../actions/submit-section-response'

export type UseSectionSubmitOpts = { sessionId: string; sectionNo: number; isLast: boolean }

export type UseSectionSubmitResult = {
  submit: (file: File, durationMs: number) => void
  submitting: boolean
  error: string | null
}

/**
 * Builds the multipart FormData payload for `submitSectionResponse`. 4 params —
 * each maps to a required field of the Server Action's payload (infrastructure
 * exception, code-style.md §3).
 */
function buildSectionFormData(
  sessionId: string,
  sectionNo: number,
  file: File,
  durationMs: number,
): FormData {
  const formData = new FormData()
  formData.append('audio', file)
  formData.append('sessionId', sessionId)
  formData.append('sectionNo', String(sectionNo))
  formData.append('durationMs', String(durationMs))
  return formData
}

/**
 * Owns a section's submit workflow: builds the FormData, guards re-entry
 * synchronously, and advances after a successful submit — to the report on the
 * last section, else a same-page refresh (which recomputes the next section and
 * remounts the runner). The real re-entry lock is the synchronous ref (code-style
 * §6), not `isPending`, which commits asynchronously and would let a second caller
 * (Submit click + a stray keyboard re-trigger) through.
 */
export function useSectionSubmit({
  sessionId,
  sectionNo,
  isLast,
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
      const formData = buildSectionFormData(sessionId, sectionNo, file, durationMs)

      try {
        const result = await submitSectionResponse(formData)
        if (result.success) {
          // isLast → terminal nav (submit already awaited); do NOT reset the ref.
          // Else refresh in place — the page's `key` change remounts + resets us.
          if (isLast) router.push(`/app/elp/report/${sessionId}`)
          else router.refresh()
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
