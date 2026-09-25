'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { setOwnPassword } from '../actions'

const SetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export function SetPasswordForm({ nextPath }: Readonly<{ nextPath: string | null }>) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const parsed = SetPasswordSchema.safeParse({ password, confirmPassword })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setLoading(true)
    try {
      const result = await setOwnPassword(parsed.data)
      if (!result.success) {
        setError(result.error)
        return
      }
    } catch {
      setError('Unable to update password. Please try again.')
      return
    } finally {
      setLoading(false)
    }

    window.location.assign(nextPath ?? '/app/dashboard')
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="w-full space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-medium">Set your password</h2>
        <p className="text-sm text-muted-foreground">Choose your own password to continue.</p>
      </div>

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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <LoadingButton type="submit" loading={loading} loadingText="Saving..." className="w-full">
        Set password
      </LoadingButton>
    </form>
  )
}
