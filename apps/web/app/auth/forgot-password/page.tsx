import { AuthShell } from '@/components/auth/auth-shell'
import { ForgotPasswordForm } from './_components/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <AuthShell subtitle="Reset your password">
      <ForgotPasswordForm />
    </AuthShell>
  )
}
