'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { LoadingButton } from '@/components/ui/loading-button'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { setPasswordFromLink } from '../actions'
import { LinkUnavailable } from './link-unavailable'

export function SetPasswordForm({ tokenHash }: Readonly<{ tokenHash: string }>) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)
  const [continueTo, setContinueTo] = useState<string | null>(null)
  const submittedRef = useRef(false)

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
      if (result.linkInvalid) setLinkInvalid(true)
      else {
        setError(result.error)
        setContinueTo(result.redirectTo ?? null)
        // Held when only the Continue link remains; released so the form can be resubmitted.
        submittedRef.current = Boolean(result.redirectTo)
      }
    } catch {
      setError('Unable to update password. Please try again.')
      submittedRef.current = false
    }
    setLoading(false)
  }

  if (linkInvalid) return <LinkUnavailable reason="invalid" />

  return (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-medium">Set your password</h2>
        <p className="text-sm text-muted-foreground">Choose your own password to continue.</p>
      </div>

      <NewPasswordFields
        password={password}
        confirmPassword={confirmPassword}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {continueTo ? (
        <Link
          href={continueTo}
          className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue
        </Link>
      ) : (
        <LoadingButton type="submit" loading={loading} loadingText="Saving..." className="w-full">
          Set password
        </LoadingButton>
      )}
    </form>
  )
}
