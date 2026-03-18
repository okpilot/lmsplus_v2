'use server'

import { cookies } from 'next/headers'

export async function clearRecoveryCookie() {
  const cookieStore = await cookies()
  cookieStore.delete('__recovery_pending')
}
