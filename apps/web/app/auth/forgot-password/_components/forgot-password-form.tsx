'use client'

import Link from 'next/link'
import { useState } from 'react'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { requestRecoveryCode } from '../actions'
import { RecoveryCodeForm } from './recovery-code-form'

const EmailSchema = z.string().email('Please enter a valid email address')

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = EmailSchema.safeParse(email)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid email')
      return
    }

    setLoading(true)
    try {
      const response = await requestRecoveryCode({ email: result.data })
      if (!response.ok) {
        setError('Please enter a valid email address')
        return
      }
    } catch {
      setError('Unable to send reset code. Please try again.')
      return
    } finally {
      setLoading(false)
    }

    setSent(true)
  }

  if (sent) {
    return <RecoveryCodeForm email={email} onRequestNewCode={() => setSent(false)} />
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@flightschool.com"
          required
          autoFocus
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <LoadingButton type="submit" loading={loading} loadingText="Sending..." className="w-full">
        Send reset code
      </LoadingButton>

      <p className="text-center text-sm">
        <Link href="/" className="text-muted-foreground hover:text-primary">
          Back to login
        </Link>
      </p>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/legal/terms" className="hover:text-primary underline">
          Terms of Service
        </Link>
        {' · '}
        <Link href="/legal/privacy" className="hover:text-primary underline">
          Privacy Policy
        </Link>
      </p>
    </form>
  )
}
