import { SetPasswordLinkSchema } from '@/lib/auth/set-password-link'
import { LinkUnavailable } from './_components/link-unavailable'
import { SetPasswordForm } from './_components/set-password-form'

type SearchParams = Promise<{ token_hash?: string; type?: string }>

export default async function SetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const { token_hash: tokenHash, type } = await searchParams
  const link = SetPasswordLinkSchema.safeParse({ tokenHash, type })

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[400px] md:rounded-lg md:border md:border-border md:p-8 md:shadow-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">L</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">LMS Plus</h1>
        </div>
        {link.success ? (
          <SetPasswordForm tokenHash={link.data.tokenHash} />
        ) : (
          <LinkUnavailable reason="missing" />
        )}
      </div>
    </main>
  )
}
