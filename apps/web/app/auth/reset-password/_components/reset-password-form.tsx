'use client'

import { createClient } from '@repo/db/client'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ResetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function ResetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRequestLink, setShowRequestLink] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = ResetPasswordSchema.safeParse({ password, confirmPassword })
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password: result.data.password,
      })

      if (updateError) {
        const isSessionMissing = updateError.message?.includes('session missing')
        setError(
          isSessionMissing
            ? 'Your reset link has expired. Please request a new one.'
            : 'Unable to update password. Please try again.',
        )
        setShowRequestLink(isSessionMissing)
        return
      }
    } catch {
      setError('Unable to update password. Please try again.')
      return
    } finally {
      setLoading(false)
    }

    window.location.href = '/app/dashboard'
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoFocus
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

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your password"
          required
        />
      </div>

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

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Updating...' : 'Update password'}
      </Button>

      <p className="text-center text-sm">
        <Link href="/" className="text-muted-foreground hover:text-primary">
          Back to login
        </Link>
      </p>
    </form>
  )
}
