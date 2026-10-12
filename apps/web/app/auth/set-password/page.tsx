import { AuthCard } from '@/components/kit/auth-card'
import { requireActiveTempPassword } from '@/lib/auth/require-active-temp-password'
import { safeNextPath } from '@/lib/auth/safe-next-path'
import { SetPasswordForm } from './_components/set-password-form'

export default async function SetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string }> }>) {
  const { next } = await searchParams
  const nextPath = safeNextPath(next)

  await requireActiveTempPassword(nextPath)

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthCard>
        <SetPasswordForm nextPath={nextPath} />
      </AuthCard>
    </main>
  )
}
