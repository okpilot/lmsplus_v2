import { AuthShell } from '@/components/auth/auth-shell'
import { SetPasswordEntry } from './_components/set-password-entry'

type SearchParams = Promise<{ token_hash?: string; type?: string }>

export default async function SetPasswordPage({
  searchParams,
}: Readonly<{ searchParams: SearchParams }>) {
  const { token_hash: tokenHash, type } = await searchParams

  return (
    <AuthShell>
      <SetPasswordEntry tokenHash={tokenHash} type={type} />
    </AuthShell>
  )
}
