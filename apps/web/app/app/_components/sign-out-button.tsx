'use client'

import { createClient } from '@repo/db/client'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ROW_CLASS, RowIcon } from './sidebar-item'

const EXIT = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9']

export function SignOutButton({ variant = 'button' }: Readonly<{ variant?: 'button' | 'row' }>) {
  const signingOut = useRef(false)

  async function handleSignOut() {
    if (signingOut.current) return
    signingOut.current = true
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('[SignOutButton] sign-out failed:', error)
      signingOut.current = false
      return
    }
    // Full document load: drops the signed-out user's client router cache.
    window.location.assign('/')
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
