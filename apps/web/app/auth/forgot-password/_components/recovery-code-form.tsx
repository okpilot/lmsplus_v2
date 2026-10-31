'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingButton } from '@/components/ui/loading-button'
import { verifyRecoveryCode } from '../actions'

const CodeSchema = z.string().regex(/^\d{6,10}$/, 'Enter the code from your email')

const GENERIC_ERROR = 'That code is invalid or has expired.'

type RecoveryCodeFormProps = Readonly<{
  email: string
  onRequestNewCode: () => void
}>

export function RecoveryCodeForm({ email, onRequestNewCode }: Readonly<RecoveryCodeFormProps>) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const result = CodeSchema.safeParse(code)
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Invalid code')
      return
    }

    setLoading(true)
    try {
      const response = await verifyRecoveryCode({ email, code: result.data })
      if (!response.ok) {
        setError(response.error)
        return
      }
    } catch {
      setError(GENERIC_ERROR)
      return
    } finally {
      setLoading(false)
    }

    router.push('/auth/reset-password')
  }

  return (
    <div className="w-full space-y-4">
      <p className="text-body text-muted-foreground">
        If an account exists for <strong>{email}</strong>, we sent a reset code to it.
      </p>

      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Reset code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            required
            autoFocus
          />
        </div>

        <FieldError role="alert">{error}</FieldError>

        <LoadingButton
          type="submit"
          loading={loading}
          loadingText="Verifying..."
          className="w-full"
        >
          Verify code
        </LoadingButton>
      </form>

      <div className="flex items-center justify-between text-body">
        <Button type="button" variant="link" onClick={onRequestNewCode} className="h-auto px-0">
          Send a new code
        </Button>
        <Link
          href="/"
          className="text-muted-foreground underline underline-offset-4 hover:text-primary-text"
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}
