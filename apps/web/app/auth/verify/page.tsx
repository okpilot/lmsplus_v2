import Link from 'next/link'

type Props = {
  searchParams: Promise<{ error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'The magic link is invalid. Please try again.',
  invalid_code: 'The magic link has expired or already been used. Please request a new one.',
  not_registered:
    'Your account has not been set up yet. Please contact your flight school administrator.',
}

export default async function VerifyPage({ searchParams }: Props) {
  const { error } = await searchParams
  const errorMessage = error ? ERROR_MESSAGES[error] : null

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        {errorMessage ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-destructive">
              Something went wrong
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
            <Link
              href="/"
              className="mt-6 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to login
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              We sent you a magic link. Click the link in your email to sign in.
            </p>
            <p className="mt-6 text-xs text-muted-foreground">
              Didn&apos;t receive it?{' '}
              <Link
                href="/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Try again
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}
