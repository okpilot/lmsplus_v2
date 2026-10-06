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
import type { ConnectionStatus } from '../_utils/connection-state'
import { resumeQueue } from '../_utils/with-reconnect'
import { SaveFailedActions } from './save-failed-actions'

export const STALL_ESCAPE_MS = 60_000

function signInHref(): string {
  const { pathname, search } = window.location
  return `/?next=${encodeURIComponent(pathname + search)}`
}

/** Blocks the quiz while a save is unsent (offline or slow), a save was refused, or the sign-in has expired. */
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
  const waiting = status === 'offline' || status === 'slow'
  const refused = status === 'save-failed'
  return (
    // Not dismissable: open is derived from the store; onOpenChange is deliberately ignored.
    <AlertDialog open={waiting || signedOut || refused}>
      <AlertDialogContent>
        <OverlayCopy status={status} />
        {signedOut && <Button onClick={() => window.location.assign(signInHref())}>Sign in</Button>}
        {refused && <SaveFailedActions />}
        {waiting && <ReloadEscape />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

const COPY = {
  offline: {
    title: 'Connection lost — reconnecting…',
    body: 'Keep this page open. Your answer will be sent when the connection returns.',
  },
  slow: {
    title: 'Still saving…',
    body: 'This is taking longer than usual. Keep this page open.',
  },
  'save-failed': {
    title: 'Your answer was not saved',
    body: 'Try again, or continue without it — it will then count as unanswered.',
  },
  'signed-out': {
    title: 'Your sign-in has expired',
    body: 'Sign in again to continue. Answers not yet saved will need to be entered again.',
  },
}

function isBlockStatus(status: ConnectionStatus): status is keyof typeof COPY {
  return status in COPY
}

function OverlayCopy({ status }: Readonly<{ status: ConnectionStatus }>) {
  // Keep the last block's copy while the dialog fades out after status returns to ok/saved.
  const [shown, setShown] = useState<keyof typeof COPY>('offline')
  if (isBlockStatus(status) && status !== shown) {
    setShown(status)
  }
  const copy = COPY[shown]
  return (
    <AlertDialogHeader>
      <AlertDialogTitle>{copy.title}</AlertDialogTitle>
      <AlertDialogDescription>{copy.body}</AlertDialogDescription>
    </AlertDialogHeader>
  )
}

/** After STALL_ESCAPE_MS offline or slow, lets the student give up waiting; the leave prompt still warns. */
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
