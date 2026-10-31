import { Link } from '@/components/ui/link'

export function ResetSuccess() {
  return (
    <div className="space-y-4 text-center">
      <p className="text-body text-muted-foreground">
        Your password has been updated successfully.
      </p>
      <Link href="/auth/reset-password/done" tone="primary" className="inline-block text-label">
        Sign in with your new password
      </Link>
    </div>
  )
}
