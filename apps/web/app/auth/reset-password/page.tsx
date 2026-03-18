import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ResetPasswordForm } from './_components/reset-password-form'

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const recoveryPending = cookieStore.get('__recovery_pending')?.value === '1'

  if (!recoveryPending) {
    redirect('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px] md:rounded-lg md:border md:border-border md:p-8 md:shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">L</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">LMS Plus</h1>
        </div>
        <p className="mb-6 text-center text-sm text-muted-foreground">Password reset</p>
        <ResetPasswordForm />
      </div>
    </main>
  )
}
