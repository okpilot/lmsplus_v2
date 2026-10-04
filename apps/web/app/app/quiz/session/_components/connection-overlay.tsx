'use client'

import { useEffect, useLayoutEffect } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useConnectionState } from '../_hooks/use-connection-state'
import { getConnectionStatus, setConnectionStatus } from '../_utils/connection-state'

function signInHref(): string {
  const { pathname, search } = window.location
  return `/?next=${encodeURIComponent(pathname + search)}`
}

/** Blocks the quiz while a save is unsent (offline) or the sign-in has expired. */
export function ConnectionOverlay() {
  const { status } = useConnectionState()

  // A stale 'signed-out' from an earlier session page must not block a new one; before paint.
  useLayoutEffect(() => {
    if (getConnectionStatus() === 'signed-out') setConnectionStatus('ok')
  }, [])

  useEffect(() => {
    if (status === 'saved') toast.success('Saved ✓')
  }, [status])

  const signedOut = status === 'signed-out'
  return (
    // Not dismissable: open is derived from the store; onOpenChange is deliberately ignored.
    <AlertDialog open={status === 'offline' || signedOut}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {signedOut ? 'Your sign-in has expired' : 'Connection lost — reconnecting…'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {signedOut
              ? 'Sign in again to continue.'
              : 'Keep this page open. Your answer will be sent when the connection returns.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {signedOut && <Button onClick={() => window.location.assign(signInHref())}>Sign in</Button>}
      </AlertDialogContent>
    </AlertDialog>
  )
}
