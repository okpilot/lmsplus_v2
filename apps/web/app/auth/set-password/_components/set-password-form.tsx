'use client'

import { useState } from 'react'
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

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = NewPasswordSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    try {
      const result = await setPasswordFromLink({ ...parsed.data, tokenHash, type: 'recovery' })
      if (result.redirectTo) {
        window.location.assign(result.redirectTo)
        return
      }
      if (!result.success) {
        if (result.linkInvalid) setLinkInvalid(true)
        else setError(result.error)
      }
    } catch {
      setError('Unable to update password. Please try again.')
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

      <LoadingButton type="submit" loading={loading} loadingText="Saving..." className="w-full">
        Set password
      </LoadingButton>
    </form>
  )
}
