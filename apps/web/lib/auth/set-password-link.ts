import { z } from 'zod'

/** Query contract of the emailed set-password link. Hex covers GoTrue's `hashed_token` shape. */
export const SetPasswordLinkSchema = z.object({
  tokenHash: z.string().regex(/^[0-9a-f]{32,128}$/i),
  type: z.literal('recovery'),
})

export const LINK_INVALID_MESSAGE =
  'This link has expired or has already been used. You can still get in with a reset code.'
export const LINK_MISSING_MESSAGE =
  'This link is incomplete. Open the link from your email again, or get in with a reset code.'

/** Builds the emailed link from a fixed origin; the token is encoded as a query value only. */
export function buildSetPasswordUrl(appUrl: string, hashedToken: string): string {
  const url = new URL('/auth/set-password', appUrl)
  url.searchParams.set('token_hash', hashedToken)
  url.searchParams.set('type', 'recovery')
  return url.toString()
}

/** The Forgot-password walkthrough shown in the email and on the link-unavailable page. */
export function forgotPasswordSteps(): string[] {
  return [
    'Go to the LMS Plus login page.',
    'Click "Forgot password?".',
    'Enter your email address.',
    'Enter the code from the email we send you.',
    'Choose a password.',
  ]
}
