'use client'

import { Button } from '@/components/ui/button'
import { useSignOut } from '../_hooks/use-sign-out'
import { ROW_CLASS, RowIcon } from './sidebar-item'

const EXIT = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9']

export function SignOutButton({ variant = 'button' }: Readonly<{ variant?: 'button' | 'row' }>) {
  const { pending, signOut } = useSignOut()

  if (variant === 'row') {
    return (
      <Button variant="ghost" className={ROW_CLASS} disabled={pending} onClick={signOut}>
        <RowIcon paths={EXIT} />
        Sign out
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground"
      disabled={pending}
      onClick={signOut}
    >
      Sign out
    </Button>
  )
}
