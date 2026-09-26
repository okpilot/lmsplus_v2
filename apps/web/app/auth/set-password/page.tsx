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
      <div className="w-full max-w-[400px] md:rounded-lg md:border md:border-border md:p-8 md:shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">L</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">LMS Plus</h1>
        </div>
        <SetPasswordForm nextPath={nextPath} />
      </div>
    </main>
  )
}
