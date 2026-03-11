'use client'

import { createClient } from '@repo/db/client'
import { useEffect, useState } from 'react'
import { z } from 'zod'

const EmailSchema = z.string().email('Please enter a valid email address')

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
      setError(authError.message)
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
