import Link from 'next/link'
import { Heading } from '@/components/ui/heading'
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

      <div className="space-y-2 text-sm">
        <p className="font-medium">To get in:</p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          {forgotPasswordSteps().map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2 text-center text-sm">
        <Link
          href="/auth/forgot-password"
          className="text-primary-text underline underline-offset-4"
        >
          Forgot password
        </Link>
        <Link href="/" className="text-muted-foreground underline underline-offset-4">
          Go to the login page
        </Link>
      </div>
    </div>
  )
}
