'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTakenOver } from '../_hooks/use-taken-over'
import { clearTakenOver } from '../_utils/session-takeover'
import { backToQuizzes, continueHere } from '../_utils/takeover-actions'

/** Blocks the quiz once another tab or device has taken this session over. */
export function TakeoverDialog({ sessionId }: Readonly<{ sessionId: string }>) {
  const router = useRouter()
  const takenOver = useTakenOver(sessionId)
  // External-store sync: no stale flag outlives the runner page.
  useEffect(() => () => clearTakenOver(sessionId), [sessionId])
  return (
    // Not dismissable: open is derived from the store; onOpenChange is deliberately ignored.
    <AlertDialog open={takenOver}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This quiz was opened in another tab or device</AlertDialogTitle>
          <AlertDialogDescription>
            Continue here to take it back, or go back to your quizzes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => backToQuizzes(router.replace)}>
            Back to quizzes
          </Button>
          <Button autoFocus onClick={continueHere}>
            Continue here
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
