'use client'

import { useState } from 'react'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { FieldError } from '@/components/ui/field-error'
import { Link } from '@/components/ui/link'
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
        <div className="space-y-stack-sm">
          <FieldError role="alert">{error}</FieldError>
          {showRequestLink && (
            <Link href="/auth/forgot-password" tone="primary" className="text-label">
              Request a new code
            </Link>
          )}
        </div>
      )}

      <LoadingButton type="submit" loading={loading} loadingText="Updating..." className="w-full">
        Update password
      </LoadingButton>

      <p className="text-center text-body">
        <Link href="/" tone="muted">
          Back to login
        </Link>
      </p>
    </form>
  )
}
