'use client'

import { useState } from 'react'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { LoadingButton } from '@/components/ui/loading-button'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { setOwnPassword } from '../actions'

export function SetPasswordForm({ nextPath }: Readonly<{ nextPath: string | null }>) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      const result = await setOwnPassword(parsed.data)
      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }
    } catch {
      setError('Unable to update password. Please try again.')
      setLoading(false)
      return
    }

    window.location.assign(nextPath ?? '/app/dashboard')
  }

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
