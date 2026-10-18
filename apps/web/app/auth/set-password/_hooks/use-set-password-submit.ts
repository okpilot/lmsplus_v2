'use client'

import { useRef, useState } from 'react'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { setPasswordFromLink } from '../actions'

type FailureResult = Extract<Awaited<ReturnType<typeof setPasswordFromLink>>, { success: false }>

export function useSetPasswordSubmit(tokenHash: string) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [continueTo, setContinueTo] = useState<string | null>(null)
  const submittedRef = useRef(false)

  function applyFailure(result: FailureResult) {
    if (result.linkInvalid) {
      setLinkInvalid(true)
      return
    }
    setError(result.error)
    setContinueTo(result.redirectTo ?? null)
    // Held when only the Continue link remains; released so the form can be resubmitted.
    submittedRef.current = Boolean(result.redirectTo)
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = NewPasswordSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    if (submittedRef.current) return
    submittedRef.current = true
    setLoading(true)
    try {
      const result = await setPasswordFromLink({ ...parsed.data, tokenHash, type: 'recovery' })
      if (result.success) {
        window.location.assign(result.redirectTo)
        return
      }
      applyFailure(result)
    } catch {
      setError('Unable to update password. Please try again.')
      submittedRef.current = false
    }
    setLoading(false)
  }

  return {
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    loading,
    linkInvalid,
    continueTo,
    handleSubmit,
  }
}
