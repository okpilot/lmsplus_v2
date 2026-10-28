import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth/auth-shell'
import { ResetPasswordForm } from './_components/reset-password-form'

export default async function ResetPasswordPage() {
  const cookieStore = await cookies()
  const recoveryPending = cookieStore.get('__recovery_pending')?.value === '1'

  if (!recoveryPending) {
    redirect('/')
  }

  return (
    <AuthShell subtitle="Password reset">
      <ResetPasswordForm />
    </AuthShell>
  )
}
