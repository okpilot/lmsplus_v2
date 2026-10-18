import { SetPasswordLinkSchema } from '@/lib/auth/set-password-link'
import { LinkUnavailable } from './link-unavailable'
import { SetPasswordForm } from './set-password-form'

export function SetPasswordEntry({
  tokenHash,
  type,
}: Readonly<{ tokenHash?: string; type?: string }>) {
  const link = SetPasswordLinkSchema.safeParse({ tokenHash, type })
  if (!link.success) return <LinkUnavailable reason="missing" />
  return <SetPasswordForm tokenHash={link.data.tokenHash} />
}
