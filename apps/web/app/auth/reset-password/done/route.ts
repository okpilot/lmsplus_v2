import { redirect } from 'next/navigation'
import { clearRecoveryPendingCookie } from '@/lib/auth/recovery-pending-cookie'

export async function GET() {
  await clearRecoveryPendingCookie()
  redirect('/')
}
