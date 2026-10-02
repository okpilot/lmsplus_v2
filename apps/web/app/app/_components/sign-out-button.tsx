'use client'

import { createClient } from '@repo/db/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ROW_CLASS, RowIcon } from './sidebar-item'

const EXIT = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9']

export function SignOutButton({ variant = 'button' }: Readonly<{ variant?: 'button' | 'row' }>) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (variant === 'row') {
    return (
      <Button variant="ghost" className={ROW_CLASS} onClick={handleSignOut}>
        <RowIcon paths={EXIT} />
        Sign out
      </Button>
    )
  }

  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleSignOut}>
      Sign out
    </Button>
  )
}
