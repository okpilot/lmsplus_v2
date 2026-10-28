'use client'

import Link from 'next/link'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { buttonVariants } from '@/components/ui/button-variants'
import { FieldError } from '@/components/ui/field-error'
import { Heading } from '@/components/ui/heading'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSetPasswordSubmit } from '../_hooks/use-set-password-submit'
import { LinkUnavailable } from './link-unavailable'

function SubmitArea({
  continueTo,
  loading,
}: Readonly<{ continueTo: string | null; loading: boolean }>) {
  if (continueTo) {
    return (
      <Link href={continueTo} className={buttonVariants({ className: 'w-full' })}>
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

  if (form.status.linkInvalid) return <LinkUnavailable reason="invalid" />

  return (
    <form noValidate onSubmit={form.handleSubmit} className="w-full space-y-4">
      <div className="space-y-1 text-center">
        <Heading level={2}>Set your password</Heading>
        <p className="text-body text-muted-foreground">Choose your own password to continue.</p>
      </div>

      <NewPasswordFields
        password={form.password}
        confirmPassword={form.confirmPassword}
        onPasswordChange={form.setPassword}
        onConfirmPasswordChange={form.setConfirmPassword}
      />

      <FieldError role="alert">{form.status.error}</FieldError>

      <SubmitArea continueTo={form.status.continueTo} loading={form.status.loading} />
    </form>
  )
}
