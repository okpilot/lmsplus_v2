'use client'

import Link from 'next/link'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSetPasswordSubmit } from '../_hooks/use-set-password-submit'
import { LinkUnavailable } from './link-unavailable'

function SubmitArea({
  continueTo,
  loading,
}: Readonly<{ continueTo: string | null; loading: boolean }>) {
  if (continueTo) {
    return (
      <Link
        href={continueTo}
        className="block rounded-lg bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Continue
      </Link>
    )
  }
  return (
    <LoadingButton type="submit" loading={loading} loadingText="Saving..." className="w-full">
      Set password
    </LoadingButton>
  )
}

export function SetPasswordForm({ tokenHash }: Readonly<{ tokenHash: string }>) {
  const form = useSetPasswordSubmit(tokenHash)

  if (form.linkInvalid) return <LinkUnavailable reason="invalid" />

  return (
    <form noValidate onSubmit={form.handleSubmit} className="w-full space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="text-lg font-medium">Set your password</h2>
        <p className="text-sm text-muted-foreground">Choose your own password to continue.</p>
      </div>

      <NewPasswordFields
        password={form.password}
        confirmPassword={form.confirmPassword}
        onPasswordChange={form.setPassword}
        onConfirmPasswordChange={form.setConfirmPassword}
      />

      {form.error && <p className="text-sm text-destructive">{form.error}</p>}

      <SubmitArea continueTo={form.continueTo} loading={form.loading} />
    </form>
  )
}
