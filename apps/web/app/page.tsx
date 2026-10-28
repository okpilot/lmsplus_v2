import { AuthShell } from '@/components/auth/auth-shell'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { LoginForm } from './_components/login-form'

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Authentication failed. Please try signing in again.',
  invalid_code: 'The authentication code has expired or already been used.',
  not_registered:
    'Your account has not been set up yet. Please contact your flight school administrator.',
  profile_lookup_failed: 'We could not verify your account right now. Please try again.',
  auth_failed: 'Authentication failed. Please try again.',
  account_inactive:
    'Your account has been deactivated. Please contact your flight school administrator.',
}

type Props = {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: Readonly<Props>) {
  const { error, next } = await searchParams
  const initialError = error
    ? (ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.')
    : undefined

  return (
    <AuthShell subtitle="Sign in to your account">
      <LoginForm initialError={initialError} nextPath={safeNextPath(next)} />
    </AuthShell>
  )
}
