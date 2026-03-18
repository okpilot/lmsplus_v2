import Link from 'next/link'

export function ResetSuccess() {
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-muted-foreground">Your password has been updated successfully.</p>
      <Link
        href="/auth/reset-password/done"
        className="inline-block text-sm font-medium text-primary hover:underline underline-offset-4"
      >
        Sign in with your new password
      </Link>
    </div>
  )
}
