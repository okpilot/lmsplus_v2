'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
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
import { resumeQueue } from '../_utils/with-reconnect'

export const STALL_ESCAPE_MS = 60_000

function signInHref(): string {
  const { pathname, search } = window.location
  return `/?next=${encodeURIComponent(pathname + search)}`
}

/** Blocks the quiz while a save is unsent (offline) or the sign-in has expired. */
export function ConnectionOverlay() {
  const { status } = useConnectionState()

  // A stale block from an earlier session page must not stay on a new one; before paint.
  useLayoutEffect(() => {
    resumeQueue()
  }, [])

  useEffect(() => {
    if (status === 'saved') toast.success('Saved ✓')
  }, [status])

  const signedOut = status === 'signed-out'
  return (
    // Not dismissable: open is derived from the store; onOpenChange is deliberately ignored.
    <AlertDialog open={status === 'offline' || signedOut}>
      <AlertDialogContent>
        <OverlayCopy signedOut={signedOut} />
        {signedOut && <Button onClick={() => window.location.assign(signInHref())}>Sign in</Button>}
        {status === 'offline' && <ReloadEscape />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function OverlayCopy({ signedOut }: Readonly<{ signedOut: boolean }>) {
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>
        {signedOut ? 'Your sign-in has expired' : 'Connection lost — reconnecting…'}
      </AlertDialogTitle>
      <AlertDialogDescription>
        {signedOut
          ? 'Sign in again to continue. Answers not yet saved will need to be entered again.'
          : 'Keep this page open. Your answer will be sent when the connection returns.'}
      </AlertDialogDescription>
    </AlertDialogHeader>
  )
}

/** After STALL_ESCAPE_MS offline, lets the student give up waiting; the leave prompt still warns. */
function ReloadEscape() {
  const [stalled, setStalled] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setStalled(true), STALL_ESCAPE_MS)
    return () => clearTimeout(timer)
  }, [])
  if (!stalled) return null
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Still waiting? Reloading loses answers not yet sent.
      </p>
      <Button variant="outline" onClick={() => window.location.reload()}>
        Reload page
      </Button>
    </>
  )
}
