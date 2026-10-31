import { Heading } from '@/components/ui/heading'
import { Link } from '@/components/ui/link'
import {
  forgotPasswordSteps,
  LINK_INVALID_MESSAGE,
  LINK_MISSING_MESSAGE,
} from '@/lib/auth/set-password-link'

export function LinkUnavailable({ reason }: Readonly<{ reason: 'invalid' | 'missing' }>) {
  return (
    <div className="w-full space-y-4">
      <div className="space-y-1 text-center">
        <Heading level={2}>This link cannot be used</Heading>
        <p className="text-body text-muted-foreground">
          {reason === 'invalid' ? LINK_INVALID_MESSAGE : LINK_MISSING_MESSAGE}
        </p>
      </div>

      <div className="space-y-2 text-body">
        <p className="font-medium">To get in:</p>
        <ol className="list-decimal space-y-1 pl-prose-indent text-muted-foreground">
          {forgotPasswordSteps().map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2 text-center text-body">
        <Link href="/auth/forgot-password" tone="primary">
          Forgot password
        </Link>
        <Link href="/" tone="muted">
          Go to the login page
        </Link>
      </div>
    </div>
  )
}
