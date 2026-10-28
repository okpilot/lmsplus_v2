'use client'

import { createClient } from '@repo/db/client'
import Link from 'next/link'
import { useState } from 'react'
import { z } from 'zod'
import { PasswordToggle } from '@/components/auth/password-toggle'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

const FRIENDLY_AUTH_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'Invalid email or password.',
  'Email rate limit exceeded': 'Too many attempts. Please wait a moment and try again.',
  'For security purposes, you can only request this once every 60 seconds':
    'Please wait 60 seconds before trying again.',
}

type LoginFormProps = {
  initialError?: string
  nextPath?: string | null
}

/** Signs in with Supabase; returns a user-facing error message, or null on success. */
async function signIn(credentials: { email: string; password: string }): Promise<string | null> {
  try {
    const { error } = await createClient().auth.signInWithPassword(credentials)
    if (!error) return null
    return FRIENDLY_AUTH_ERRORS[error.message] ?? 'Unable to sign in. Please try again.'
  } catch {
    return 'Unable to sign in. Please try again.'
  }
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function LoginForm({ initialError, nextPath }: Readonly<LoginFormProps>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = LoginSchema.safeParse({ email, password })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    const signInError = await signIn(result.data)
    if (signInError) {
      setError(signInError)
      setLoading(false)
      return
    }

    // Keep loading state active — the page is navigating away
    window.location.href = nextPath
      ? `/auth/login-complete?next=${encodeURIComponent(nextPath)}`
      : '/auth/login-complete'
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

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className="pr-10"
          />
          <PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary-text"
        >
          Forgot password?
        </Link>
      </div>

      <FieldError role="alert">{error}</FieldError>

      <LoadingButton type="submit" loading={loading} loadingText="Signing in..." className="w-full">
        Sign in
      </LoadingButton>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account? Contact your administrator.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/legal/terms" className="underline underline-offset-4 hover:text-primary-text">
          Terms of Service
        </Link>
        {' · '}
        <Link
          href="/legal/privacy"
          className="underline underline-offset-4 hover:text-primary-text"
        >
          Privacy Policy
        </Link>
      </p>
    </form>
  )
}
