'use client'

import Link from 'next/link'
import { useState } from 'react'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { LoadingButton } from '@/components/ui/loading-button'
import { NewPasswordSchema } from '@/lib/auth/new-password-schema'
import { resetOwnPassword } from '../actions'
import { ResetSuccess } from './reset-success'

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showRequestLink, setShowRequestLink] = useState(false)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = NewPasswordSchema.safeParse({ password, confirmPassword })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    try {
      const result2 = await resetOwnPassword(result.data)
      if (!result2.ok) {
        setError(result2.message)
        setShowRequestLink(result2.isSessionMissing)
        return
      }
    } catch {
      setError('Unable to update password. Please try again.')
      return
    } finally {
      setLoading(false)
    }

    setSuccess(true)
  }

  if (success) return <ResetSuccess />

  return (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <NewPasswordFields
        password={password}
        confirmPassword={confirmPassword}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />

      {error && (
        <div className="space-y-1">
          <p className="text-sm text-destructive">{error}</p>
          {showRequestLink && (
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-primary hover:underline underline-offset-4"
            >
              Request a new reset link
            </Link>
          )}
        </div>
      )}

      <LoadingButton type="submit" loading={loading} loadingText="Updating..." className="w-full">
        Update password
      </LoadingButton>

      <p className="text-center text-sm">
        <Link href="/" className="text-muted-foreground hover:text-primary">
          Back to login
        </Link>
      </p>
    </form>
  )
}
