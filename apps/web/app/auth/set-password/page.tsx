import { AuthCard } from '@/components/kit/auth-card'
import { SetPasswordEntry } from './_components/set-password-entry'

type SearchParams = Promise<{ token_hash?: string; type?: string }>

export default async function SetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const { token_hash: tokenHash, type } = await searchParams

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <AuthCard>
        <SetPasswordEntry tokenHash={tokenHash} type={type} />
      </AuthCard>
    </main>
  )
}
