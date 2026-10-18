import { cookies } from 'next/headers'

/** Locks the current session to `/auth/reset-password` only (the proxy enforces it). */
export async function setRecoveryPendingCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('__recovery_pending', '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
}

/** Lifts the `/auth/reset-password` pin once the new password is saved. */
export async function clearRecoveryPendingCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('__recovery_pending')
}
