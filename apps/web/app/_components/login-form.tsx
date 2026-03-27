'use client'

import { createClient } from '@repo/db/client'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
}

export function LoginForm({ initialError }: LoginFormProps) {
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
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      })

      if (authError) {
        setError(FRIENDLY_AUTH_ERRORS[authError.message] ?? 'Unable to sign in. Please try again.')
        setLoading(false)
        return
      }
    } catch {
      setError('Unable to sign in. Please try again.')
      setLoading(false)
      return
    }

    // Keep loading state active — the page is navigating away
    window.location.href = '/auth/login-complete'
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
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-sm text-muted-foreground hover:text-primary"
        >
          Forgot password?
        </Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Signing in...' : 'Sign in'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account? Contact your administrator.
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
