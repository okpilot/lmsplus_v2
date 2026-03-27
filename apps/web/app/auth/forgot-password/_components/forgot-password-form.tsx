'use client'

import { createClient } from '@repo/db/client'
import Link from 'next/link'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(result.data, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/auth/reset-password`,
      })

      if (resetError) {
        setError('Unable to send reset email. Please try again.')
        return
      }
    } catch {
      setError('Unable to send reset email. Please try again.')
      return
    } finally {
      setLoading(false)
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          If an account exists for <strong>{email}</strong>, you will receive a password reset email
          shortly.
        </p>
        <Link
          href="/"
          className="inline-block text-sm font-medium text-primary hover:underline underline-offset-4"
        >
          Back to login
        </Link>
      </div>
    )
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

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Sending...' : 'Send reset email'}
      </Button>

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
