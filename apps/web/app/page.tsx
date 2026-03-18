import { LoginForm } from './_components/login-form'

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Authentication failed. Please try signing in again.',
  invalid_code: 'The authentication code has expired or already been used.',
  not_registered:
    'Your account has not been set up yet. Please contact your flight school administrator.',
  profile_lookup_failed: 'We could not verify your account right now. Please try again.',
  auth_failed: 'Authentication failed. Please try again.',
  invalid_recovery_link:
    'The password reset link is invalid or has expired. Please request a new one.',
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { error } = await searchParams
  const initialError = error
    ? (ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.')
    : undefined

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px] md:rounded-lg md:border md:border-border md:p-8 md:shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">L</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">LMS Plus</h1>
        </div>
        <p className="mb-6 text-center text-sm text-muted-foreground">Sign in to your account</p>
        <LoginForm initialError={initialError} />
      </div>
    </main>
  )
}
