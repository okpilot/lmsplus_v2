import { AuthCard } from '@/components/kit/auth-card'
import { ForgotPasswordForm } from './_components/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthCard>
        <p className="mb-6 text-center text-sm text-muted-foreground">Reset your password</p>
        <ForgotPasswordForm />
      </AuthCard>
    </main>
  )
}
