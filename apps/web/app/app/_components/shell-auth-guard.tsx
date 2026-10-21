import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/get-session-user'

export async function ShellAuthGuard() {
  if (!(await getSessionUser())) redirect('/')
  return null
}
