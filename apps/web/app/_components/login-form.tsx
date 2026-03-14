'use client'

import { createClient } from '@repo/db/client'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const EmailSchema = z.string().email('Please enter a valid email address')

// Map known Supabase error messages to user-friendly text
const FRIENDLY_AUTH_ERRORS: Record<string, string> = {
  'Email rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'Unable to validate email address: invalid format': 'Please enter a valid email address.',
  'Signups not allowed for otp': 'Unable to send sign-in link. Please try again.',
  'For security purposes, you can only request this once every 60 seconds':
    'Please wait 60 seconds before requesting another link.',
}

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // SSR renders button disabled; enables after hydration so Playwright auto-waits
  useEffect(() => setHydrated(true), [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = EmailSchema.safeParse(email)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid email')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: result.data,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)

    if (authError) {
      setError(
        FRIENDLY_AUTH_ERRORS[authError.message] ?? 'Unable to send sign-in link. Please try again.',
      )
      return
    }

    window.location.href = '/auth/verify'
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@flightschool.com"
          required
          // biome-ignore lint/a11y/noAutofocus: login email is the primary action
          autoFocus
          className="mt-1.5 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={!hydrated || loading}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Sending link...' : 'Send magic link'}
      </button>
    </form>
  )
}
