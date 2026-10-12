import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthCard } from '@/components/kit/auth-card'
import { ResetPasswordForm } from './_components/reset-password-form'

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const recoveryPending = cookieStore.get('__recovery_pending')?.value === '1'

  if (!recoveryPending) {
    redirect('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthCard>
        <p className="mb-6 text-center text-sm text-muted-foreground">Password reset</p>
        <ResetPasswordForm />
      </AuthCard>
    </main>
  )
}
